/** This is the function for creating liquidity pool */

const bs58 = require("bs58");
const BN = require("bn.js");
require("dotenv").config();
const {
    clusterApiUrl,
    Connection,
    PublicKey,
    Keypair
} = require("@solana/web3.js");
const {
    getMint,
} = require("@solana/spl-token");
const {
    Token,
    Liquidity,
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TxVersion,
    buildSimpleTransaction
} = require("@raydium-io/raydium-sdk");
const { Market } = require("@project-serum/serum");
import {xWeiAmount, getWalletTokenAccount, sendAndConfirmTransactions} from "./utils"

const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0;
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));

console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");

export const createPool = async (mintAddress, tokenAmount, solAmount) => {
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

// createPool(TOKEN_ADDRESS, 1000000000, 2);


