const dotenv = require("dotenv");
const {
    FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
    FlashbotsBundleResolution,
    FlashbotsBundleTransaction
} = require("@flashbots/ethers-provider-bundle");
const {BigNumber, providers, Wallet, utils, Signer, VoidSigner} = require('ethers');

dotenv.config({path: '.env'});


const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL
// provider 是普通的提供者 做單筆交易
const provider = new providers.StaticJsonRpcProvider(ETHEREUM_RPC_URL);

const f1 = new Wallet(process.env.F1_WALLET_PK, provider);
const f2 = new Wallet(process.env.F2_WALLET_PK, provider);
const f3 = new Wallet(process.env.F3_WALLET_PK, provider);

async function main() {

    // flashbots 的 provider 是比較厲害的提供者 可以一次做多筆交易
    const flashbotsProvider = await FlashbotsBundleProvider.create(
        provider,
        f1,
        process.env.FLASHBOTS_PROVIDER_URL, // 一定要給
        process.env.FLASHBOST_NETWORK_NAME // 一定要給
    );


    // Step 1: Make a transaction. Send ETH from f2 wallet to f3 wallet
    const tx1 = {
        from: f2.address,
        to: f3.address,
        value: (await f2.getBalance()),
        nonce: await f2.getTransactionCount(),
        gasPrice: (await f2.getGasPrice()).mul(2),
        gasLimit: 21000,
        chainId: parseInt(process.env.CHAIN_ID),
    }

    // 不需要 estimateGas 跟合約互動才需要
    // tx1.gasLimit = await provider.estimateGas(tx1)

    // 發送全部的 eth 但是要扣掉手續費
    tx1.value = tx1.value.sub(BigNumber.from(tx1.gasPrice).mul(tx1.gasLimit))


    // Step 2: Make a transaction. Send ETH from f3 wallet to f1 wallet
    const tx2 = {
        from: f3.address,
        to: f1.address,
        value: tx1.value,
        nonce: await f3.getTransactionCount(),
        gasPrice: (await provider.getGasPrice()).mul(2),
        gasLimit: 21000,
        chainId: parseInt(process.env.CHAIN_ID),
    }
    // 發送全部的 eth 但是要扣掉手續費
    tx2.value = tx2.value.sub(BigNumber.from(tx2.gasPrice).mul(tx2.gasLimit))

    // Step 3: put the two transactions to the bundle transactions with signer. Then f1 can use it.
    const bundleTransactions = [
        {
            transaction: tx1,
            signer: f2
        },
        {
            transaction: tx2,
            signer: f3
        },
    ];

    // 這裡只是模擬交易
    // const block = await provider.getBlockNumber();
    // const signedTransactions = await flashbotsProvider.signBundle(bundleTransactions)
    // const simulation = await flashbotsProvider.simulate(signedTransactions, block + 1, block + 2)
    // console.log(JSON.stringify(simulation, null, 2))

    provider.on('block', async (blockNumber) => {

        // 在第幾個區塊送出交易
        const targetBlockNumber = blockNumber + parseInt(process.env.AFTER_BLOCKERS);
        console.log(`Current Block Number: ${blockNumber},   Target Block Number:${targetBlockNumber}`)

        // 在上面指定了 flashbotsProvider 的 signer 是 f1，所以會用 f1 做簽名
        // 真正執行交易的程式碼
        // Step 4: The final step is let f1(flashbotsProvider) call the sendBundle function.
        const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNumber);

        if ('error' in bundleResponse) {
            throw new Error(bundleResponse.error.message)
        }

        const bundleResolution = await bundleResponse.wait()
        if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
            console.log(`Congrats, included in ${targetBlockNumber}`)
            process.exit(0)
        } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            console.log(`Not included in ${targetBlockNumber}`)
        } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log("Nonce too high, bailing")
            process.exit(1)
        }
    })

}


main();