import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  email: string;
  userUUID: Schema.Types.UUID;
  discoveryCode: string;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    userUUID: { type: Schema.Types.UUID, required: true, unique: true },
    discoveryCode: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const UserModel = model<IUser>("User", UserSchema);
