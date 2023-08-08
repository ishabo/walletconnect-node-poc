const express = require('express');
const bodyParser = require('body-parser');
const { SignClient } = require('@walletconnect/sign-client');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');

const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());
const approvals = {};
const sessions = {};

let signClient;

const proposalNamespace = {
  eip155: {
    chains: ["eip155:5"],
    methods: ["eth_sendTransaction"],
    events: ["connect", "disconnect"],
  },
};

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

        const id = uuidv4();
        approvals[id]= approval;

        res.json({ uri, fbUrl: `https://console.fireblocks.io/v2/wc?uri=${encodeURIComponent(uri)}`, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/disconnect', async (req, res) => {
  try {
    const { id } = req.body;
    const session = sessions[id];
    await signClient.disconnect({
      topic: session.topic,
      code: 6000,
      message: "User disconnected",
    });
    delete sessions[id];
    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/approve', async (req, res) => {
  try {
    const { id } = req.query;
    const approval = approvals[id];
    const session = await approval();
    sessions[id] = session;
    delete approvals[id];
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


const sendTransaction = async (session, from, value) => {
    console.error(value);
    const tx = {
        from,
        to: "0xF71B3332e225d8382c44Cf30DC8fb6D2c48bf884",
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
        const { from, id } = req.body;
        const session = sessions[id];
        const result = await sendTransaction(session, from, "0x16345785d8a0000");

        res.json({ txHash: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/get-account', async (req, res) => {
  try {
    const { id } = req.query;
    const session = sessions[id];
    const account = session.namespaces.eip155.accounts[0].slice(9)

    res.json({ account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 5000;

app.listen(PORT, async () => {
    signClient = await SignClient.init({
      projectId: process.env.PROJECT_ID,
    })
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

    setInterval(async () => {
      try {
        const firstId = Object.keys(sessions)[0];
        if (firstId) {
          const session = sessions[firstId];
          const account = session.namespaces.eip155.accounts[0].slice(9)
          const result = await sendTransaction(session, account, "0x16345785d8a0000");
          console.log(result);
        }
      } catch (e) {
        console.error(e);
      }
    }, 15000);
});
