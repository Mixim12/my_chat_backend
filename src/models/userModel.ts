import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  password: string;
  email: string;
  userUUID: Schema.Types.UUID;
  discoveryCode: string;
  status: "online" | "offline";
  lastSeen: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    userUUID: { type: Schema.Types.UUID, required: true, unique: true },
    discoveryCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ["online", "offline"], default: "offline" },
    lastSeen: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
UserSchema.index({ userUUID: 1, createdAt: 1 });
UserSchema.index({ discoveryCode: 1, createdAt: 1 });

export const UserModel = model<IUser>("User", UserSchema);
