const RD_PORTS = Array.from({ length: 21 }, (_, i) => 11100 + i);
const RD_TIMEOUT_MS = 20000;
const RD_PROBE_MS = 800;
const NO_RD_SERVICE = "No RD service answered on this machine (ports 11100 to 11120); paste the PID block from the device instead.";

const WADH_SOURCE = { FINGERPRINT: "2.5FYYNN", IRIS: "2.5IYYNN" };
const CAPTURE_COUNTS = {
  FINGERPRINT: 'fCount="1" fType="2" iCount="0" iType="0"',
  IRIS: 'fCount="0" fType="2" iCount="1" iType="0"',
};

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function sealAadhaar(publicKey, number) {
  const der = fromBase64(String(publicKey).replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-1" }, false, ["encrypt"]);
  return toBase64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(number)));
}

async function wadhFor(authMethod) {
  return toBase64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(WADH_SOURCE[authMethod])));
}

async function capturePath(port) {
  const res = await fetch(`http://127.0.0.1:${port}/`, { method: "RDSERVICE", signal: AbortSignal.timeout(RD_PROBE_MS) });
  const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
  const service = xml.querySelector("RDService");
  if (!service) return null;
  if (service.getAttribute("status") === "NOTREADY") throw new Error("The RD service is running but the device is not ready.");
  const capture = [...xml.querySelectorAll("Interface")].find((node) => node.getAttribute("id") === "CAPTURE");
  return capture?.getAttribute("path") || "/rd/capture";
}

async function findDevice() {
  for (const port of RD_PORTS) {
    try {
      const path = await capturePath(port);
      if (path) return { port, path };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("The RD service")) throw err;
    }
  }
  throw new Error(NO_RD_SERVICE);
}

export async function captureFromDevice(authMethod) {
  const { port, path } = await findDevice();
  const options = `<PidOptions ver="1.0"><Opts ${CAPTURE_COUNTS[authMethod]} format="0" pidVer="2.0" timeout="15000" posh="UNKNOWN" env="P" wadh="${await wadhFor(authMethod)}"/></PidOptions>`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "CAPTURE",
    headers: { "Content-Type": "text/xml" },
    body: options,
    signal: AbortSignal.timeout(RD_TIMEOUT_MS),
  });
  const text = await res.text();
  const resp = new DOMParser().parseFromString(text, "text/xml").querySelector("Resp");
  if (resp && resp.getAttribute("errCode") !== "0") throw new Error(resp.getAttribute("errInfo") || "The device did not capture.");
  return text;
}
