import fetch from "node-fetch";
import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { executionPeerPort, consensusClient } from "../commandLineOptions.js";
import os from "os";
import { getMacAddress } from "../getSystemStats.js";

// Hardcoded BG execution peers
const hardcodedBGExecutionPeers = [
  "enode://fb14d72321ee823fcf21e163091849ee42e0f6ac0cddc737d79e324b0a734c4fc51823ef0a96b749c954483c25e8d2e534d1d5fc2619ea22d58671aff96f5188@65.109.103.148:30303",
  "enode://40f40acd78004650cce57aa302de9acbf54becf91b609da93596a18979bb203ba79fcbee5c2e637407b91be23ce72f0cc13dfa38d13e657005ce842eafb6b172@65.109.103.149:30303",
  "enode://9e50857aa48a7a31bc7b46957e8ced0ef69a7165d3199bea924cb6d02b81f1f35bd8e29d21a54f4a331316bf09bb92716772ea76d3ef75ce027699eccfa14fad@141.94.97.22:30303",
  "enode://96dc133ce3aeb5d9430f1dce1d77a36418c8789b443ae0445f06f73c6b363f5b35c019086700a098c3e6e54974d64f37e97d72a5c711d1eae34dc06e3e00eed5@141.94.97.74:30303",
  "enode://516cbfbe9bbf26b6395ed68b24e383401fc33e7fe96b9d235ebca86c9f812fde8d33a7dbebc0fb5595459d2c5cc6381595d96507af89e6b48b5bdd0ebf8af0c0@141.94.97.84:30303",
  "enode://fc86a93545c56322dd861180b76632b9baeb65af8f304269b489b4623ae060847569c3c3c10c4b39baf221a2cdefea66efabce061a542cdcda374cbba45aa3d4@51.68.39.206:30303",
  "enode://0e6dd3815a627893515465130c1e95aa73b18fe2f723b2467f3abf94df9be036f27595f301b5e78750ad128e59265f980c92033ae903330c0460c40ae088c04a@35.210.37.245:30303",
  "enode://b72d6233d50bef7b31c09f3ea39459257520178f985a872bbaa4e371ed619455b7671053ffe985af1b5fb3270606e2a49e4e67084debd75e6c9b93e227c5b01c@35.210.156.59:30303"
];

export async function fetchBGExecutionPeers() {
  try {
    // Instead of calling an API, return the hardcoded enodes.
    debugToFile(
      "fetchBGExecutionPeers(): Using hardcoded enodes:\n" +
        hardcodedBGExecutionPeers.join("\n")
    );
    return hardcodedBGExecutionPeers;
  } catch (error) {
    debugToFile("fetchBGExecutionPeers() error:", error);
    return [];
  }
}

export async function configureBGExecutionPeers(bgPeers) {
  try {
    const { exec } = await import("child_process");
    const isNethermind = consensusClient.toLowerCase() === "nethermind";

    for (const enode of bgPeers) {
      if (isNethermind) {
        // For Nethermind, only call nethermind_addPeer.
        const curlCommand = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"nethermind_addPeer","params":["${enode}"]}' http://localhost:8545`;
        exec(curlCommand, (error, stdout, stderr) => {
          if (error) {
            debugToFile(
              `configureBGExecutionPeers() [Nethermind]: Error executing curl command: ${error}`
            );
            return;
          }
          if (stderr) {
            debugToFile(
              `configureBGExecutionPeers() [Nethermind]: Curl command stderr: ${stderr}`
            );
            return;
          }
          debugToFile(
            `configureBGExecutionPeers() [Nethermind]: Curl command stdout: ${stdout}`
          );
        });
      } else {
        // Geth related configuration is commented out.
        /*
        const curlCommandAddPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addPeer","params":["${enode}"]}' http://localhost:8545`;
        const curlCommandAddTrustedPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addTrustedPeer","params":["${enode}"]}' http://localhost:8545`;

        exec(curlCommandAddPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(`configureBGExecutionPeers() [Geth]: Error executing curl command: ${error}`);
            return;
          }
          if (stderr) {
            debugToFile(`configureBGExecutionPeers() [Geth]: Curl command stderr: ${stderr}`);
            return;
          }
          debugToFile(`configureBGExecutionPeers() [Geth]: Curl command stdout: ${stdout}`);
        });

        exec(curlCommandAddTrustedPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(`configureBGExecutionPeers() [Geth]: Error executing curl command for trusted peer: ${error}`);
            return;
          }
          if (stderr) {
            debugToFile(`configureBGExecutionPeers() [Geth]: Curl command stderr for trusted peer: ${stderr}`);
            return;
          }
          debugToFile(`configureBGExecutionPeers() [Geth]: Curl command stdout for trusted peer: ${stdout}`);
        });
        */
      }
    }
  } catch (error) {
    debugToFile(
      `configureBGExecutionPeers() error: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function fetchBGConsensusPeers() {
  try {
    const response = await fetch("https://rpc.buidlguidl.com:48544/peerids");
    const data = await response.json();

    const peerIDValues = data.peerids
      .map((peer) => peer.peerid)
      .filter((peerid) => peerid && peerid !== "null");

    return peerIDValues;
  } catch (error) {
    debugToFile("fetchBGConsensusPeers() error:", error);
    return [];
  }
}

export async function configureBGConsensusPeers() {
  try {
    const response = await fetch("https://rpc.buidlguidl.com:48544/consensusPeerAddr");
    const data = await response.json();

    const macAddress = await getMacAddress();
    const thisMachineID = `${os.hostname()}-${macAddress}-${os.platform()}-${os.arch()}`;

    const filteredPeers = data.consensusPeerAddrs.filter(
      (peer) =>
        peer.consensusClient === consensusClient &&
        peer.machineID !== thisMachineID
    );

    const peerAddresses = filteredPeers.flatMap((peer) =>
      peer.consensusPeerAddr.split(",")
    );

    const result = peerAddresses.join(",");

    // For Nethermind, execute the additional consensus peer configuration via JSON-RPC.
    if (consensusClient.toLowerCase() === "nethermind") {
      const { exec } = await import("child_process");
      const curlCommand = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"nethermind_addConsensusPeer","params":["${result}"]}' http://localhost:8545`;
      
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) {
          debugToFile(`configureBGConsensusPeers() [Nethermind]: Error executing curl command for consensus peer: ${error}`);
          return;
        }
        if (stderr) {
          debugToFile(`configureBGConsensusPeers() [Nethermind]: Curl command stderr for consensus peer: ${stderr}`);
          return;
        }
        debugToFile(`configureBGConsensusPeers() [Nethermind]: Curl command stdout for consensus peer: ${stdout}`);
      });
    }

    return result;
  } catch (error) {
    debugToFile("configureBGConsensusPeers() error:", error);
    return "";
  }
}
