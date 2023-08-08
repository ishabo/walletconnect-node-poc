import { useEffect, useState } from "react";
import { Web3Modal } from "@web3modal/standalone";
import axios from 'axios';
// import Web3 from 'web3';
import "./App.css";


axios.defaults.baseURL = process.env.REACT_APP_BASE_URL || 'http://localhost:5000';

const web3Modal = new Web3Modal({
  projectId: process.env.REACT_APP_PROJECT_ID,
  standaloneChains: ["eip155:5"],
});

//
function App() {
  const [account, setAccount] = useState();
  const [sessionId, setSessionId] = useState(window.localStorage.getItem("sessionId"));
  const [fbUrl, setFbUrl] = useState();
  const [txnHash, setTxnHash] = useState();
  const [amount, setAmount] = useState(0.1);
  const [sendingStatus, setSendingStatus] = useState(false);

  async function handleConnect() {
    try {
      const { data: { uri, id, fbUrl } } = await axios.get("/connect")
      console.error(uri)
      setFbUrl(fbUrl);
      window.localStorage.setItem("sessionId", id);
      setSessionId(id);

      if (uri) {
        web3Modal.openModal({ uri });
        const { data: { session }} = await axios.get(`/approve?id=${id}`)
        setAccount(session.namespaces.eip155.accounts[0].slice(9));
        web3Modal.closeModal();
      }
    } catch (e) {
      console.log(e);
    }
  }

  async function handleDisconnect() {
    try {
      await signClient.disconnect({
        topic: sessions.topic,
        code: 6000,
        message: "User disconnected",
      });
      reset();
    } catch (e) {
      console.log(e);
    }
  }

  async function subscribeToEvents(client) {
    if (!client)
      throw Error("No events to subscribe to b/c the client does not exist");

    try {
      client.on("session_delete", () => {
        console.log("user disconnected the session from their wallet");
        reset();
      });
    } catch (e) {
      console.log(e);
    }
  }

  async function handleSend() {
    try {
      // const value = "0x" + Number(Web3.utils.toWei(amount.toString(), "ether")).toString(16);
      setSendingStatus(true);
      const { data: { txHash } } = await axios.post("/send", {  from: account, id: sessionId }, { headers: { 'Content-Type': 'application/json' } });
      setTxnHash(txHash);
      setSendingStatus(false);

    } catch (e) {
      console.log(e);
    }
  }

  return (
    <div className="App">
      <h1>Connect to Fireblocks</h1>
      {account ? (
        <>
          <p>{account}</p>
            <input type="number" placeholder="Eth amount" onChange={setAmount} value={amount} />
            <button onClick={handleSend}>Send</button> {sendingStatus && <p>Sending...</p>}
          <br /><br />
          <button onClick={handleDisconnect}>Disconnect</button>
          { txnHash && <p>View your transaction <a href={`https://goerli.etherscan.io/tx/${txnHash}`} target="_blank" rel="noreferrer">here</a>!</p>}
        </>
      ) : (
        fbUrl
          ? (<><br /><a href={fbUrl} target="_blank">Auth with Fireblocks</a></>)
          :  (<button onClick={handleConnect}>Connect</button>)
      )}
    </div>
  );
}

export default App;
