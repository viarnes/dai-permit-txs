const { expect } = require('chai');
const HARDHAT_CHAIN_ID = 31337; // https://hardhat.org/config/#hardhat-network
const TEST_WAD = 100;
const HOLDER_PRIV_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const PERMIT_TYPEHASH = '0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb';

describe('Bitera/Dai transactions', () => {
  let ward, holder, spender;
  let dai;

  before(async () => {
    const Dai = await ethers.getContractFactory('Dai');
    dai = await Dai.deploy(HARDHAT_CHAIN_ID);
    await dai.deployed();
    [ward, holder, spender] = await ethers.getSigners();
  });

  describe('Dai.sol', () => {
    it('should mint dai', async () => {
      await dai.mint(holder.address, TEST_WAD);
      expect(await dai.balanceOf(holder.address)).to.equal(TEST_WAD);
    });

    it('should not allow spender to transfer dai', async () => {
      await expect(dai.transferFrom(holder.address, spender.address, TEST_WAD)).to.be.revertedWith('Dai/insufficient-allowance');
    });

    it('should allow spender to transfer dai', async () => {
      let nonce = 0;
      let expiry = 9999999999;
      let DOMAIN_SEPARATOR = await dai.DOMAIN_SEPARATOR.call();
      let prefix = '\x19\x01';
      let abiCoder = new ethers.utils.AbiCoder();

      let msg = ethers.utils.keccak256(abiCoder.encode(
        ['bytes32', 'address', 'address', 'uint256', 'uint256', 'bool'], 
        [PERMIT_TYPEHASH, holder.address, spender.address, nonce, expiry, 1]
      ););

      let digest = ethers.utils.solidityKeccak256(
        ['string', 'bytes32', 'bytes32'], 
        [prefix, DOMAIN_SEPARATOR, msg]
      );

      const signingKey = new ethers.utils.SigningKey(HOLDER_PRIV_KEY);
      const signature = signingKey.signDigest(digest);

      let v = signature.v, 
          r = signature.r,
          s = signature.s;

      await dai.permit(holder.address, spender.address, nonce, expiry, 1, v, r, s);
      expect(await dai.balanceOf(spender.address)).to.equal(0);
      await dai.connect(spender).transferFrom(holder.address, spender.address, TEST_WAD);
      expect(await dai.balanceOf(spender.address)).to.equal(TEST_WAD);
    });
  });
});
