// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import {OwnableStorage} from "@solidstate/contracts/access/ownable/OwnableStorage.sol";
import "./INameWrapperRegistry.sol";
import "./OptiDomainsAttestation.sol";

error NotDiamondOwner();

interface IVersionableResolver {
    // event VersionChanged(bytes32 indexed node, uint64 newVersion);

    function recordVersions(bytes32 node) external view returns (uint64);
    function clearRecords(bytes32 node) external;
}

/**
 * @dev derived from https://github.com/mudgen/diamond-2 (MIT license)
 */
library DiamondBaseStorage {
    struct Layout {
        // function selector => (facet address, selector slot position)
        mapping(bytes4 => bytes32) facets;
        // total number of selectors registered
        uint16 selectorCount;
        // array of selector slots with 8 selectors per slot
        mapping(uint256 => bytes32) selectorSlots;
        address fallbackAddress;
    }

    bytes32 internal constant STORAGE_SLOT =
        keccak256('solidstate.contracts.storage.DiamondBase');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

abstract contract DiamondResolverUtil {
    error Unauthorised();

    event VersionChanged(bytes32 indexed node, uint64 newVersion);

    modifier baseOnlyOwner() {
        if (msg.sender != OwnableStorage.layout().owner) revert NotDiamondOwner();
        _;
    }

    function _registry() internal view returns(INameWrapperRegistry) {
        return IHasNameWrapperRegistry(address(this)).registry();
    }

    function _attestation() internal view returns(OptiDomainsAttestation) {
        return OptiDomainsAttestation(_registry().attestation());
    }

    function _readAttestation(bytes32 node, bytes32 key) internal view returns(bytes memory) {
        return _attestation().readAttestation(node, key);
    }

    function _attest(bytes32 node, bytes32 key, bytes memory value) internal {
        _attestation().attest(node, key, value);
    }

    function _recordVersions(bytes32 node) internal view returns (uint64) {
        return _attestation().readVersion(node);
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function _clearRecords(bytes32 node) internal virtual {
        _attestation().increaseVersion(node);
        emit VersionChanged(node, _recordVersions(node));
    }

    function _isAuthorised(bytes32 node) internal view returns (bool) {
        (bool success, bytes memory result) = address(this).staticcall(
            abi.encodeWithSelector(0x25f36704, msg.sender, node)
        );
        if (!success) return false;
        return abi.decode(result, (bool));
    }

    modifier authorised(bytes32 node) {
        if (!_isAuthorised(node)) revert Unauthorised();
        _;
    }
}
