const express = require('express');
const bodyParser = require('body-parser');
const { SignClient } = require('@walletconnect/sign-client');
const FireblocksSDK = require("fireblocks-sdk").FireblocksSDK;
const {  v4 : uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const EventEmitter = require('events');
const fs = require('fs');

dotenv.config();

let sessions = {};
let orders = {};

let signClient;
const chains = {
  goerli: "eip155:5",
}


const baseUrl = process.env.FIREBLOCKS_URL || "https://api.fireblocks.io";
const chainId = process.env.CHAIN_ID || "goerli";

let fireblocks;

const proposalNamespace = {
  eip155: {
    chains: [chains[chainId]],
    methods: ["eth_sendTransaction"],
    events: ["connect", "disconnect"],
  },
};


eventEmitter = new EventEmitter();
eventEmitter.on('create-order', (data) => {
  const { id, value, to, orderId } = data;
  orders[orderId] = setInterval(async () => {
    try {
      const session = sessions[id];
      if (!session) {
        throw new Error(`Cannot send transaction: Session ${id} not found`);
      }

      if (!orders[orderId]) {
        throw new Error(`Cannot send transaction: Order ${orderId} not found`);
      }

      const account = session.namespaces.eip155.accounts[0].slice(9)
      const result = await sendTransaction(session, account, to, value); // "0x16345785d8a0000"
      console.log("Transaction sent at", new Date().toISOString(), result);
    } catch (e) {
      console.error(e);
    }
  }, 12000);
});

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'build')));
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});

app.get('/connect', async (req, res) => {
    try {
      if (!signClient) {
        throw new Error("SignClient not initialized");
      }
        const { uri, approval } = await signClient.connect({
            requiredNamespaces: proposalNamespace,
        });

        const payload = {
          feeLevel: "MEDIUM",
          vaultAccountId: 0,
          chainIds: ["ETH"],
          uri,
        };

        const connectionResponse = await fireblocks.createWeb3Connection("WalletConnect", payload);
        const { id } = connectionResponse;
        const result = await fireblocks.submitWeb3Connection("WalletConnect", id, true);

        const session = await approval();
        sessions[id] = session;

        console.log(result, id);
        res.json({ id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/disconnect', async (req, res) => {
  try {
    const { id } = req.body;
    const session = sessions[id];

    if (!session) {
      res.status(400).json({ error: `Session ${id} not found` });
      return;
    }

    await signClient.disconnect({
      topic: session.topic,
      code: 6000,
      message: "User disconnected",
    });

    const result = await fireblocks.removeWeb3Connection("WalletConnect", id);
    delete sessions[id];

    Object.keys(orders).forEach(clearInterval);
    orders = {};

    console.log(result, id);

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const sendTransaction = async (session, from, to, value) => {
    const tx = {
        from,
        to,
        data: "0x",
        gasPrice: "0x029104e28c",
        gasLimit: "0x5208",
        value,
    };

    const result = await signClient.request({
        topic: session.topic,
        request: {
            method: "eth_sendTransaction",
            params: [tx]
        },
        chainId: "eip155:5"
    });

  return result

}

app.post('/send', async (req, res) => {
    try {
        const { to, id } = req.body;
        const session = sessions[id];
        if (session) {
          const from = session.namespaces.eip155.accounts[0].slice(9)
          const result = await sendTransaction(session, from, to, "0x16345785d8a0000");
          res.json({ txHash: result });
        } else {
          res.status(400).json({ error: `Session ${id} not found` });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/create-order', async (req, res) => {
  try {
    const { id, value, to } = req.body;
    if (!id || !value || !to) {
      res.status(400).json({ error: `Missing body params ${JSON.stringify(req.body)}` });
      return;
    }
    const orderId = uuidv4();
    console.log("Creating order", orderId)
    eventEmitter.emit('create-order', { id, orderId, value, to });
    res.json({ orderId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/cancel-order', async (req, res) => {
  try {
    const { id, orderId } = req.body;
    if (!id || !orderId) {
      res.status(400).json({ error: `Missing body params ${JSON.stringify(req.body)}` });
      return;
    }

    if (!orders[orderId]) {
      res.status(400).json({ error: `Order ${orderId} not found` });
      return;
    }
    clearInterval(orders[orderId]);
    delete orders[orderId];
    console.log("Cancelled order", orderId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


const PORT = 5000;

app.listen(PORT, async () => {
    const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8');
    const apiKey = process.env.API_KEY;

    try {
      fireblocks = new FireblocksSDK(privateKey.trim(), apiKey.trim(), baseUrl);
    } catch (e) {
      console.error(e);
    }
    signClient = await SignClient.init({
      projectId: process.env.PROJECT_ID,
    });

    signClient.on("session_update", (session) => {
      console.log("session_update", session);
    });

    signClient.on("session_request", (session) => {
      console.log("session_request", session);
    });

    signClient.on("session_delete", (session) => {
      console.log("session_delete", session);
    });
    console.log(`Server running on http://localhost:${PORT}`);

});
