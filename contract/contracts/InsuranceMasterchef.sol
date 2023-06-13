// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./InsurancePool.sol";
import "./IDistribute.sol";

interface IMintableERC20 is IERC20 {
	function mint(address _to, uint256 _amount) external;
}

interface ITransferable {
	function transfer(address to, uint256 amount) external returns (bool);
}

// Note: Precaution not to add baseToken as a pool (not make any sense)
contract InsuranceMasterchef is ReentrancyGuardUpgradeable, IDistribute {
	using SafeERC20 for IERC20;

	// Info of each user.
	struct UserInfo {
		uint256 amount; // How many LP tokens the user has provided.
		uint256 rewardDebt; // Reward debt. See explanation below.
	}

	// Info of each pool.
	struct PoolInfo {
		IERC20 lpToken; // Address of LP token contract.
		uint256 allocPoint; // How many allocation points assigned to this pool. Percentage of reward to be distributed.
		uint256 lastRewardTimestamp; // Last block number that reward distribution occurs.
		uint256 accRewardPerShare; // Accumulated reward per share, times 1e12. See below.
		uint16 depositFeeBP; // Deposit fee in basis points
	}

	// The reward token
	IERC20 public baseToken;
  // Insurance pool address
	InsurancePool public insurancePool;
	// Deposit Fee address
	address public feeAddress;

	// Info of each pool.
	uint256[] public poolInfoPidList; // pid to massUpdatePool
	address[] public poolInfoDummyList;
	mapping(uint256 => PoolInfo) public poolInfo;
	// Info of each user that stakes LP tokens.
	mapping(uint256 => mapping(address => UserInfo)) public userInfo;
	// Total allocation points. Must be the sum of all allocation points in all pools.
	uint256 public totalAllocPoint;
	// Useless but copied from a masterchef implementation
	uint256 public startTimestamp;

	event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
	event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
	event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
	event SetFeeAddress(address indexed user, address indexed newAddress);

  /**
   * @dev Tells the address of the owner
   * @return the address of the owner
   */
  function owner() public view returns(address) {
    return OwnableUpgradeable(insurancePool).owner();
  }

  modifier onlyOwner() {
    require(insurancePool.isGovernance(msg.sender), "Ownable: caller is not the owner");
    _;
  }

	function initialize(
    address _insurancePool,
		address _baseToken
	) external initializer {
    insurancePool = InsurancePool(_insurancePool);
		baseToken = IERC20(_baseToken);
		feeAddress = insurancePool.owner();
		startTimestamp = block.timestamp;

		__ReentrancyGuard_init();
	}

	function setStartTimestamp(uint256 newTimestamp) external onlyOwner {
		require(block.timestamp < newTimestamp && block.timestamp < startTimestamp, "already start");
		startTimestamp = newTimestamp;

		uint256 poolInfoPidListLength = poolInfoPidList.length;
		for (uint256 i = 0; i < poolInfoPidListLength; i++) {
			poolInfo[poolInfoPidList[i]].lastRewardTimestamp = newTimestamp;
		}
	}

	function poolLength() external view returns (uint256) {
		return poolInfoDummyList.length;
	}

	mapping(IERC20 => bool) public poolExistence;

	modifier nonDuplicated(IERC20 _lpToken) {
		require(poolExistence[_lpToken] == false, "duplicated");
		_;
	}

	// Add a new lp to the pool. Can only be called by the owner.
	function add(uint256 _allocPoint, IERC20 _lpToken, uint16 _depositFeeBP) external onlyOwner nonDuplicated(_lpToken) {
		require(_depositFeeBP <= 10000, "invalid deposit fee basis points");

		uint256 newPid = poolInfoDummyList.length;

		uint256 lastRewardTimestamp = block.timestamp > startTimestamp ? block.timestamp : startTimestamp;
		totalAllocPoint = totalAllocPoint + _allocPoint;
		poolExistence[_lpToken] = true;
		poolInfo[newPid] = PoolInfo({
		    lpToken: _lpToken,
		    allocPoint: _allocPoint,
		    lastRewardTimestamp: lastRewardTimestamp,
		    accRewardPerShare: 0,
		    depositFeeBP: _depositFeeBP
		});
		poolInfoDummyList.push(address(_lpToken));
		poolInfoPidList.push(newPid);
	}

	// emergency flag use when we add invalid token address to
	function remove(uint256 _pid, bool emergency) external onlyOwner {
		if (poolInfoPidList.length == 0) {
			return;
		}

		PoolInfo storage pool = poolInfo[_pid];
		require(address(pool.lpToken) != address(0), "not found");

		uint256 length = poolInfoPidList.length;
		for (uint256 i = 0; i < length; ++i) {
			if (poolInfoPidList[i] == _pid) {
				if (pool.allocPoint == 0 || emergency) {
					pool.allocPoint = 0;
					poolInfoPidList[i] = poolInfoPidList[length - 1];
					poolInfoPidList.pop();
				}
				break;
			}
		}
	}

	// Update the given pool's reward allocation point and deposit fee. Can only be called by the owner.
	function set(uint256 _pid, uint256 _allocPoint, uint16 _depositFeeBP) external onlyOwner {
		require(_depositFeeBP <= 10000, "invalid deposit fee basis points");

		uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
		totalAllocPoint = (totalAllocPoint - prevAllocPoint) + _allocPoint;
		poolInfo[_pid].allocPoint = _allocPoint;
		poolInfo[_pid].depositFeeBP = _depositFeeBP;

		if (_allocPoint > 0 && prevAllocPoint == 0) {
			uint256 length = poolInfoPidList.length;
			bool found = false;
			for (uint256 i = 0; i < length; ++i) {
				if (poolInfoPidList[i] == _pid) {
					found = true;
					break;
				}
			}

			if (!found) {
				poolInfoPidList.push(_pid);
			}
		}
	}

	// View function to see pending reward on frontend.
	function pendingReward(uint256 _pid, address _user) external view returns (uint256) {
		PoolInfo storage pool = poolInfo[_pid];
		UserInfo storage user = userInfo[_pid][_user];
		uint256 accRewardPerShare = pool.accRewardPerShare;
		return ((user.amount * accRewardPerShare) / 1e12) - user.rewardDebt;
	}

	// Update reward variables for all pools. Be careful of gas spending!
	function distribute(uint256 _amount) public {
    require(msg.sender == address(insurancePool), "Not insurance pool");
		uint256 length = poolInfoPidList.length;
		for (uint256 i = 0; i < length; ++i) {
			updatePool(poolInfoPidList[i], _amount);
		}
	}

	// Update reward variables of the given pool to be up-to-date.
	function updatePool(uint256 _pid, uint256 _amount) public {
		PoolInfo storage pool = poolInfo[_pid];
		if (block.timestamp <= pool.lastRewardTimestamp) {
			return;
		}
		uint256 lpSupply = pool.lpToken.balanceOf(address(this));
		if (lpSupply == 0 || pool.allocPoint == 0) {
			pool.lastRewardTimestamp = block.timestamp;
			return;
		}
		pool.accRewardPerShare += ((pool.allocPoint * _amount * 1e12) / totalAllocPoint / lpSupply);
		pool.lastRewardTimestamp = block.timestamp;
	}

	// Deposit LP tokens for reward allocation.
	function deposit(uint256 _pid, uint256 _amount) public nonReentrant {
		PoolInfo storage pool = poolInfo[_pid];
		UserInfo storage user = userInfo[_pid][msg.sender];

		uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
		if (pending > 0) {
			safeRewardTransfer(msg.sender, pending);
		}

		if (_amount > 0) {
			pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
			if (pool.depositFeeBP > 0) {
				uint256 depositFee = (_amount * pool.depositFeeBP) / 10000;
				pool.lpToken.safeTransfer(feeAddress, depositFee);
				user.amount = (user.amount + _amount) - depositFee;
			} else {
				user.amount = user.amount + _amount;
			}
		}
		user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
		emit Deposit(msg.sender, _pid, _amount);
	}

	function harvestAll() external {
		uint256 length = poolInfoDummyList.length;
		for (uint256 pid = 0; pid < length; ++pid) {
			deposit(pid, 0);
		}
	}

	function harvestMany(uint256[] memory pids) external {
		uint256 length = pids.length;
		for (uint256 i = 0; i < length; ++i) {
			deposit(pids[i], 0);
		}
	}

	// Withdraw LP tokens.
	function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
		PoolInfo storage pool = poolInfo[_pid];
		UserInfo storage user = userInfo[_pid][msg.sender];
		require(user.amount >= _amount, "invalid amount");

		uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
		if (pending > 0) {
			safeRewardTransfer(msg.sender, pending);
		}
		if (_amount > 0) {
			user.amount = user.amount - _amount;
			pool.lpToken.safeTransfer(address(msg.sender), _amount);
		}
		user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
		emit Withdraw(msg.sender, _pid, _amount);
	}

	// Withdraw without caring about rewards. EMERGENCY ONLY.
	function emergencyWithdraw(uint256 _pid) external nonReentrant {
		PoolInfo storage pool = poolInfo[_pid];
		UserInfo storage user = userInfo[_pid][msg.sender];
		uint256 amount = user.amount;
		user.amount = 0;
		user.rewardDebt = 0;
		pool.lpToken.safeTransfer(address(msg.sender), amount);
		emit EmergencyWithdraw(msg.sender, _pid, amount);
	}

	// Safe reward transfer function, just in case if rounding error causes pool to not have enough reward.
	function safeRewardTransfer(address _to, uint256 _amount) internal {
		uint256 rewardBal = baseToken.balanceOf(address(this));

		if (_amount > rewardBal) {
			baseToken.safeTransfer(_to, rewardBal);
		} else {
			baseToken.safeTransfer(_to, _amount);
		}
	}

	function setFeeAddress(address _feeAddress) external onlyOwner {
		feeAddress = _feeAddress;
		emit SetFeeAddress(msg.sender, _feeAddress);
	}
}