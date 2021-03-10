const { expect } = require('chai');
const DAI_ABI = require('../artifacts/contracts/Dai.sol/Dai.json');
const HARDHAT_CHAIN_ID = 31337; // https://hardhat.org/config/#hardhat-network
const TEST_WAD = 100;
const HOLDER_PRIV_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const PERMIT_TYPEHASH = '0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb';
const DOMAIN_SEPARATOR = '0x304244d5155bd6c5a079a1ba2321499d46e85aeaffd8911498d159d27832b63e';

const createPermitSignature = (holder, spender, nonce, expiry) => {
  let abiCoder = new ethers.utils.AbiCoder();
  let prefix = '\x19\x01'; // same

  /* Creación del permit + Firma */

  // priv key del que está autorizando
  const signingKey = new ethers.utils.SigningKey(HOLDER_PRIV_KEY);
  // msg que firma que contiene los parametros enunciados arriba junto al spender y el holder
  let msg = ethers.utils.keccak256(
    abiCoder.encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'bool'],
      [PERMIT_TYPEHASH, holder, spender, nonce, expiry, 1],
    ),
  );
  // hasheamos el mensaje
  let digest = ethers.utils.solidityKeccak256(
    ['string', 'bytes32', 'bytes32'],
    [prefix, DOMAIN_SEPARATOR, msg],
  );
  // lo firmamos
  return signingKey.signDigest(digest);
};

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

    /*

    El contrato de Dai https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#code
    tiene una funcionalidad que `permite` que una address controle el dai de otra address.
    Supongamos que tenemos a 0xA y 0xB (cuentas de ethereum). 0xA tiene un balance de 100 Dai pero
    no tiene ether para moverlo. 0xB no tiene saldo en Dai pero tiene ether para pagar por la transacción
    de 0xA. Entonces, 0xA firma un mensaje autorizando a 0xB a mover su Dai y se lo manda a
    0xB para que lo use. Luego, 0xB puede interactuar con el contrato de Dai solicitando
    que los Dai de 0xA se muevan hacia otra cuenta o una propia, inclusive 0xB.

    Armé los siguientes tests con el fin de comprobar esta funcionalidad y construir
    el mensaje firmado del usuario con ethers para que quede listo para implementar.

    Dejo comentarios explicando que hago en cada paso.

    (quizás valga la pena agregar más)

    */

    it('should not allow spender to transfer dai', async () => {
      // antes que nada, chequeamos que un spender (0xB por ej) no pueda mover los Dai de un holder (0xA) sin autorización
      await expect(
        dai.connect(spender).transferFrom(holder.address, spender.address, TEST_WAD),
      ).to.be.revertedWith('Dai/insufficient-allowance');
    });

    it('should allow spender to transfer dai', async () => {
      /* Parametros del permit */

      let nonce = 0; // se usa para impedir que un permit sea reutilizado
      let expiry = 9999999999; // se usa para la fecha de expiracion del permit

      const signature = createPermitSignature(
        holder.address,
        spender.address,
        nonce,
        expiry,
      );

      /*

      En este punto, el trabajo del frontend está listo.
      Puede enviarle la signature y los params del permit al backend (svc-defi)
      para que el mismo se encargue de despachar una tx hacia ethereum
      que ejecute la funciuon permit del contrato de dai.

      Para entender a fondo como esque se firma la tx y como va a ser posteriormente
      verficiada, ver: https://medium.com/@yaoshiang/ethereums-ecrecover-openzeppelin-s-ecdsa-and-web3-s-sign-8ff8d16595e1
      // y https://docs.soliditylang.org/en/v0.8.1/solidity-by-example.html?highlight=ecrecover#recovering-the-message-signer-in-solidity

      */

      // luego ejecutamos el permit
      await dai.permit(
        holder.address,
        spender.address,
        nonce,
        expiry,
        1,
        signature.v,
        signature.r,
        signature.s,
      );
      // chequeamos que el balance del spender sea 0
      expect(await dai.balanceOf(spender.address)).to.equal(0);
      // nos conectamos como el spender (en lugar de accounts[0])
      // y nos transferimos el dai del holder a nuestra propia cuenta
      await dai.connect(spender).transferFrom(holder.address, spender.address, TEST_WAD);
      // chequeamos que el balance del speander sea la cantidad movida
      expect(await dai.balanceOf(spender.address)).to.equal(TEST_WAD);
    });
  });

  describe('DaiProxy.sol', () => {
    before(async () => {
      const DaiProxy = await ethers.getContractFactory('DaiProxy');
      daiProxy = await DaiProxy.deploy();
      await daiProxy.deployed();
    });

    it('should permit and transfer in a single tx', async () => {
      let nonce = 0;
      let expiry = 9999999999; 

      const signature = createPermitSignature(
        holder.address,
        spender.address,
        nonce,
        expiry,
      );

      const iface = new ethers.utils.Interface(DAI_ABI.abi);
      const permitData = await iface.encodeFunctionData('permit', [
        holder.address,
        spender.address,
        nonce,
        expiry,
        1,
        signature.v,
        signature.r,
        signature.s,
      ]);

      const transferData = await iface.encodeFunctionData('transferFrom', [
        holder.address,
        spender.address,
        TEST_WAD,
      ]);

      await daiProxy.connect(spender).pt(dai.address, permitData, transferData);

      expect(await dai.balanceOf(spender.address)).to.equal(TEST_WAD);
    });
  });
});
