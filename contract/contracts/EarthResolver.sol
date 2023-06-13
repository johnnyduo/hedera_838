// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./optidomains/DiamondResolverUtil.sol";

bytes32 constant EARTH_RESOLVER_STORAGE = keccak256("838earth.resolver.EarthResolver");

library EarthResolverStorage {
    struct Layout {
        mapping(bytes32 => bytes32) earth;
    }

    bytes32 internal constant STORAGE_SLOT =
        keccak256('838earth.contracts.storage.EarthResolverStorage');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

// Fallback to use traditional mode
contract EarthResolver is DiamondResolverUtil, IERC165 {
    function setEarthKyc(bytes32 node, bytes32 kycHash) public authorised(node) {
        EarthResolverStorage.Layout storage l = EarthResolverStorage.layout();
        l.earth[node] = kycHash;
    }

    function earthKyc(bytes32 node) public view returns(bytes32) {
        EarthResolverStorage.Layout storage l = EarthResolverStorage.layout();
        return l.earth[node];
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(IERC165) returns (bool) {
        return false;
    }
}