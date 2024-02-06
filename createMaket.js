/** This is the function for creating liquidity pool */

const bs58 = require("bs58");
const BN = require("bn.js");
const BigNumber = require("bignumber.js");
require("dotenv").config();
const {
    clusterApiUrl,
    Connection,
    PublicKey,
    VersionedTransaction,
    Keypair
} = require("@solana/web3.js");
const {
    getMint,
    getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");
const {
    MarketV2,
    Token,
    TokenAmount,
    Liquidity,
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT,
    RAYDIUM_MAINNET,
    TxVersion,
    buildSimpleTransaction
} = require("@raydium-io/raydium-sdk");
const { Market, MARKET_STATE_LAYOUT_V3 } = require("@project-serum/serum");


const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");

const xWeiAmount = (amount, decimals) => {
    return new BN(new BigNumber(amount.toString() + "e" + decimals.toString()).toFixed(0));
};

const getWalletTokenAccount = async (connection, wallet) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
};

const sendAndConfirmTransactions = async (connection, payer, transactions) => {
    for (const tx of transactions) {
        let signature;
        if (tx instanceof VersionedTransaction) {
            tx.sign([payer]);
            signature = await connection.sendTransaction(tx);
        }
        else
            signature = await connection.sendTransaction(tx, [payer]);
        await connection.confirmTransaction({ signature });
    }
};

const createOpenBookMarket = async (mintAddress, minOrderSize, tickSize) => {
    console.log("Creating OpenBook market...", mintAddress);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    
    const { innerTransactions, address } = await MarketV2.makeCreateMarketInstructionSimple({
        connection,
        wallet: payer.publicKey,
        baseInfo: baseToken,
        quoteInfo: quoteToken,
        lotSize: minOrderSize, // default 1
        tickSize: tickSize, // default 0.01
        dexProgramId: PROGRAMIDS.OPENBOOK_MARKET,
        makeTxVersion,
    });

    const transactions = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: payer.publicKey,
        innerTransactions,
        addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("Market ID:", address.marketId.toBase58());
};

const createPool = async (mintAddress, tokenAmount, solAmount) => {
    console.log("Creating pool...", mintAddress, tokenAmount, solAmount);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (accounts.length === 0) {
        console.log("Not found OpenBook market!");
        return;
    }
    const marketId = accounts[0].publicKey;

    const startTime = Math.floor(Date.now() / 1000);
    const baseAmount = xWeiAmount(tokenAmount, mintInfo.decimals);
    const quoteAmount = xWeiAmount(solAmount, 9);
    const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);

    const { innerTransactions, address } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: PROGRAMIDS.AmmV4,
        marketInfo: {
            marketId: marketId,
            programId: PROGRAMIDS.OPENBOOK_MARKET,
        },
        baseMintInfo: baseToken,
        quoteMintInfo: quoteToken,
        baseAmount: baseAmount,
        quoteAmount: quoteAmount,
        startTime: new BN(startTime),
        ownerInfo: {
            feePayer: payer.publicKey,
            wallet: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true,
        },
        associatedOnly: false,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        feeDestinationId: DEVNET_MODE ? new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR") : new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"), // only mainnet use this
    });

    const transactions = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: payer.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("AMM ID:", address.ammId.toBase58());
};

const removeLiquidity = async (mintAddress) => {
    console.log("Removing Liquidity...", mintAddress);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return;
    }
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccounts[0].accountInfo.data);
    let poolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint: baseToken.mint,
        quoteMint: quoteToken.mint,
        baseDecimals: baseToken.decimals,
        quoteDecimals: quoteToken.decimals,
        marketId: marketAccounts[0].publicKey,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
    });
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;

    const timeoutId = setTimeout(() => {
        console.log("This will not be logged.");
      }, 5000);

    let extraPoolInfo;
    let sol;
    while (1) {
        extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
        sol = extraPoolInfo.quoteReserve.toNumber();
        console.log("============== extraPoolInfo:", sol);
        if (sol < 20) {
            clearTimeout(timeoutId);
            break;
        }
    }
    
    const lpToken = new Token(TOKEN_PROGRAM_ID, poolKeys.lpMint, poolKeys.lpDecimals);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, poolKeys.lpMint, payer.publicKey);
    
    console.log("=========== lpToken:", lpToken)
    console.log("=========== tokenAccount : ",tokenAccount)

    const amountIn = new TokenAmount(lpToken, tokenAccount.amount);
    console.log("========= amountIn : ", amountIn);

    const { innerTransactions } = await Liquidity.makeRemoveLiquidityInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            owner: payer.publicKey,
            payer: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
        },
        amountIn: amountIn,
        makeTxVersion,
    });

    const transactions = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: payer.publicKey,
        innerTransactions,
        addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("Success!");
}


// createOpenBookMarket(TOKEN_ADDRESS, 1, 0.000001);
// createPool(TOKEN_ADDRESS, 1000000000, 2);
removeLiquidity(TOKEN_ADDRESS);

