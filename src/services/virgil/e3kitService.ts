import { initCrypto, VirgilCrypto, VirgilAccessTokenSigner } from "virgil-crypto";
import {JwtGenerator} from "virgil-sdk";
import config from "../../utils/config";

async function getJwtGenerator() {
    try{
    await initCrypto();

    const virgilCrypto = new VirgilCrypto();
    // initialize JWT generator with your App ID and App Key ID you got in
    // Virgil Dashboard.
    return new JwtGenerator({
      appId: process.env.VIRGIL_APP_ID || "",
      apiKeyId: process.env.VIRGIL_APP_KEY_ID || "",
      // import your App Key that you got in Virgil Dashboard from string.
      apiKey: virgilCrypto.importPrivateKey(process.env.VIRGIL_APP_KEY || ""),
      // initialize accessTokenSigner that signs users JWTs
      accessTokenSigner: new VirgilAccessTokenSigner(virgilCrypto),
      // JWT lifetime - 20 minutes (default)
      millisecondsToLive:  20 * 60 * 1000
    });

    }catch(err){
        console.error("[VIRGIL] Error initializing JWT generator:", err);
        throw err;
    }
  }

  export default getJwtGenerator;