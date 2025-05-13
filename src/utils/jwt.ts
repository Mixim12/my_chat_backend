import * as jwt from "jsonwebtoken";
import { SignOptions } from "jsonwebtoken";
import fs from "fs";
import path from "path";


class TokenHandler {
  private privateKey: string;
  private publicKey: string;
  private algorithm: jwt.Algorithm;

  constructor(privateKey: string, publicKey: string, algorithm: jwt.Algorithm = "RS256") {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.algorithm = algorithm;
  }

  sign(payload: object, expiresIn?: SignOptions["expiresIn"]): string | null {
    try {
      const options: SignOptions = { algorithm: this.algorithm };

      if (expiresIn) {
        options.expiresIn = expiresIn;
      }

      return jwt.sign(payload, this.privateKey, options);
    } catch (error) {
      console.error("Token signing error:", error);
      return null;
    }
  }

  verify(token: string): object | string | null {
    try {
      return jwt.verify(token, this.publicKey, { algorithms: [this.algorithm] });
    } catch (error) {
      console.error("Token verification error:", error);
      return null;
    }
  }

  decode(token: string): object | string | null {
    try {
      return jwt.decode(token);
    } catch (error) {
      console.error("Token decoding error:", error);
      return null;
    }
  }
}

const privateKeyJwt = fs.readFileSync(path.join(__dirname, "../../secrets/jwt/private.key"), "utf8");
const publicKeyJwt = fs.readFileSync(path.join(__dirname, "../../secrets/jwt/public.pem"), "utf8");

const privateKeyPow = fs.readFileSync(path.join(__dirname, "../../secrets/pow/private.key"), "utf8");
const publicKeyPow = fs.readFileSync(path.join(__dirname, "../../secrets/pow/public.pem"), "utf8");

const jwtHandler = new TokenHandler(privateKeyJwt, publicKeyJwt);
const powHandler = new TokenHandler(privateKeyPow, publicKeyPow);

export interface JWTPayload {
  userUUID: string;
  exp?: number;
  [key: string]: any;
}

export function signJwt(payload: JWTPayload, expiresIn: SignOptions["expiresIn"] = "1d"): string | null {
  return jwtHandler.sign(payload, expiresIn);
}

export function verifyJwt(token: string): JWTPayload | null {
  const payload = jwtHandler.verify(token);
  if (!payload || typeof payload !== 'object') return null;
  return payload as JWTPayload;
}

export function decodeJwt(token: string): JWTPayload | null {
  const payload = jwtHandler.decode(token);
  if (!payload || typeof payload !== 'object') return null;
  return payload as JWTPayload;
}

export function signPow(payload: object): string | null {
  return powHandler.sign(payload);
}

export function verifyPow(token: string): object | string | null {
  return powHandler.verify(token);
}
