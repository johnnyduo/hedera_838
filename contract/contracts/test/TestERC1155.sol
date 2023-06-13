//SPDX-License-Identifier: None
pragma solidity >=0.8.7;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// Used for minting test ERC1155s in our tests
contract TestERC1155 is ERC1155("{id}") {
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) public returns (bool) {
        _mint(to, tokenId, amount, "");
        return true;
    }

    function uri(uint256) public pure override returns (string memory) {
        return "uri";
    }
}
