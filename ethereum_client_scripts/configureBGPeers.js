import fetch from "node-fetch";
import { getPublicIPAddress } from "../getSystemStats.js";
import { debugToFile } from "../helpers.js";
import { executionPeerPort, consensusClient } from "../commandLineOptions.js";
import os from "os";
import { getMacAddress } from "../getSystemStats.js";

export async function fetchBGExecutionPeers() {
  try {
    const publicIP = await getPublicIPAddress();
    const response = await fetch("https://rpc.buidlguidl.com:48544/enodes");
    const data = await response.json();

    const filteredEnodes = data.enodes.filter((node) => {
      const nodeUrl = new URL(node.enode);
      return !(
        nodeUrl.hostname === publicIP &&
        nodeUrl.port === executionPeerPort.toString()
      );
    });

    const filteredEnodeValues = filteredEnodes.map((node) => node.enode);

    debugToFile(
      "fetchBGExecutionPeers(): Filtered enodes:\n" +
        filteredEnodeValues.join("\n")
    );

    return filteredEnodeValues;
  } catch (error) {
    debugToFile("fetchBGExecutionPeers() error:", error);
    return [];
  }
}

export async function configureBGExecutionPeers(bgPeers) {
  try {
    const { exec } = await import("child_process");

    for (const enode of bgPeers) {
      if (consensusClient.toLowerCase() === "nethermind") {
        // For Nethermind, only use admin_addPeer since admin_addTrustedPeer is not supported.
        const curlCommandAddPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addPeer","params":["${enode}"]}' http://localhost:8545`;

        exec(curlCommandAddPeer, (error, stdout, stderr) => {
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
        // For other clients (e.g., Geth), add both peer and trusted peer.
        const curlCommandAddPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addPeer","params":["${enode}"]}' http://localhost:8545`;
        const curlCommandAddTrustedPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"admin_addTrustedPeer","params":["${enode}"]}' http://localhost:8545`;

        exec(curlCommandAddPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(
              `configureBGExecutionPeers() [Geth]: Error executing curl command: ${error}`
            );
            return;
          }
          if (stderr) {
            debugToFile(
              `configureBGExecutionPeers() [Geth]: Curl command stderr: ${stderr}`
            );
            return;
          }
          debugToFile(
            `configureBGExecutionPeers() [Geth]: Curl command stdout: ${stdout}`
          );
        });

        exec(curlCommandAddTrustedPeer, (error, stdout, stderr) => {
          if (error) {
            debugToFile(
              `configureBGExecutionPeers() [Geth]: Error executing curl command for trusted peer: ${error}`
            );
            return;
          }
          if (stderr) {
            debugToFile(
              `configureBGExecutionPeers() [Geth]: Curl command stderr for trusted peer: ${stderr}`
            );
            return;
          }
          debugToFile(
            `configureBGExecutionPeers() [Geth]: Curl command stdout for trusted peer: ${stdout}`
          );
        });
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
      .filter((peerid) => peerid && peerid !== "null"); // Filter out falsy values and "null" strings

    return peerIDValues;
  } catch (error) {
    debugToFile("fetchBGConsensusPeers() error:", error);
    return [];
  }
}

export async function configureBGConsensusPeers() {
  try {
    const response = await fetch(
      "https://rpc.buidlguidl.com:48544/consensusPeerAddr"
    );
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

    // For Nethermind, if additional consensus peer configuration via JSON-RPC is needed,
    // add the corresponding method call here.
    // For example:
    // if (consensusClient.toLowerCase() === "nethermind") {
    //   const curlCommandConsensusPeer = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"nethermind_addConsensusPeer","params":["${result}"]}' http://localhost:8545`;
    //   // Execute this command similarly to the execution peers above.
    // }

    return result;
  } catch (error) {
    debugToFile("configureBGConsensusPeers() error:", error);
    return "";
  }
}
