// Generates an RSA-2048 keypair and a self-signed X.509 certificate entirely
// in the browser via Web Crypto (crypto.subtle) - the private key never
// leaves this tab except in the one POST/PUT that submits the form, and it's
// never sent anywhere else, logged, or persisted to storage by this module.
//
// A single RSASSA-PKCS1-v1_5 keypair is used both to self-sign the
// certificate and as the private key handed to the backend. The "RSASSA"
// tag is a Web Crypto usage restriction, not a property of the key material
// itself - the exported PKCS8 bytes are an ordinary RSA private key, and the
// backend's CryptoEngine (JOSE) uses it for RSA-OAEP-256 decryption without
// caring what algorithm the browser generated it under.
export async function generateFacilityKeypair({ facilityCode, facilityName }) {
  // @peculiar/x509 uses tsyringe for DI internally, which needs this
  // polyfill loaded before the module initializes - a side-effect import,
  // must come before the @peculiar/x509 import below.
  await import("reflect-metadata");
  const { X509CertificateGenerator, PemConverter } = await import("@peculiar/x509");

  if (!window.crypto?.subtle) {
    throw new Error("Key generation requires a secure context (HTTPS or localhost) - Web Crypto isn't available here.");
  }

  const alg = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  };

  const keys = await window.crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

  // Comma-separated RFC4514-ish name string this library expects - strip
  // characters that would break attribute parsing (=, comma) rather than
  // escape them, since these are just display/identity fields.
  const safe = (v) => (v || "").replace(/[,=+<>#;\\"]/g, "").trim();
  const name = `CN=${safe(facilityCode) || "HOSP-001"}, O=${safe(facilityName) || "Hospital"}, C=IN`;

  const cert = await X509CertificateGenerator.createSelfSigned(
    {
      name,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 825 * 24 * 60 * 60 * 1000),
      signingAlgorithm: alg,
      keys,
    },
    window.crypto,
  );

  const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const privateKeyPem = PemConverter.encode(pkcs8, "PRIVATE KEY");
  const certificatePem = PemConverter.encode(cert.rawData, "CERTIFICATE");

  return {
    privateKeyPem,
    // The backend expects base64-of-the-PEM-text (not base64-of-raw-DER) -
    // see certificate_manager.rb's normalize_pem, which Base64.decode64's
    // this field and checks the *decoded* text for "BEGIN ".
    encryptionCertBase64: btoa(certificatePem),
  };
}
