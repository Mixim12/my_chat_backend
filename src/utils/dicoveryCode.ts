import { customAlphabet } from "nanoid";
import { UserModel } from "../models/userModel";
import { Schema } from "mongoose";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid7 = customAlphabet(alphabet, 7);

export function generateDiscoveryCode(): string {
  return nanoid7();
}

export async function discoveryCodeToUUID(discoveryCode: string): Promise<Schema.Types.UUID> {
  if (!discoveryCode) {
    throw new Error("Discovery code is required");
  }

  const user = await UserModel.findOne({ discoveryCode });

  if (!user) {
    throw new Error("User not found");
  }

  return user.userUUID;
}
