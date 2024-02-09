const bs58 = require('bs58');
const {
    ENDPOINT,
    RAYDIUM_MAINNET,
    TOKEN_PROGRAM_ID,
    jsonInfo2PoolKeys,
    Liquidity,
    Percent,
    Token,
    TokenAmount,
    TxVersion,
} = require('@raydium-io/raydium-sdk');
const {
    clusterApiUrl,
    Connection,
    Keypair,
} = require('@solana/web3.js');
const {
    buildAndSendTransactionList,
    getWalletTokenAccount,
} = require('./utils');

const makeTxVersion = TxVersion.V0; // LEGACY

const endpoint = clusterApiUrl('mainnet-beta');
const connection = new Connection(endpoint, 'confirmed');

const payer = Keypair.fromSecretKey(bs58.decode('3ZtesGwJ3CQQmkm7zL1uyRL292rmcatLqpGjhC3kd68dtzAzs3GXBBxyuyTHcsV31JTF5PJxZH1byWvhGWLdS75D'));
console.log("Payer:", payer.publicKey.toBase58());

const addLiquidity = async () => {
    // const baseToken = new Token(TOKEN_PROGRAM_ID, "jHEngc8wvQ2Rav4t2WvV9UAk9saP8we5d65EnoeRSmM", 9);
    // const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    // const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);

    const targetPool = "BQcSnMk4gA56fcdyCYbAgSt2DZY6o46fxDq1EzAYKcBo";
    // -------- pre-action: fetch basic info --------
    const ammV2PoolData = await fetch(ENDPOINT + RAYDIUM_MAINNET.poolInfo).then((res) => res.json())
    const targetPoolInfo = [...ammV2PoolData.official, ...ammV2PoolData.unOfficial].find((poolInfo) => poolInfo.id === targetPool);

    console.log("Target Pool:", targetPoolInfo);

    const poolKeys = jsonInfo2PoolKeys(targetPoolInfo);
    const extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    console.log("poolKeys:", poolKeys);

    // console.log("==================================================================")
    // console.log("extraPoolInfo:", extraPoolInfo);



}

addLiquidity();
