import { Schema, model, Document, Types } from "mongoose";


export interface IChannel extends Document {
  _id: Types.ObjectId;
  type: string;
  participants: Types.UUID[];
  status: string;
  groupInfo?: {
    groupName: string;
    groupDescription: string;
    groupAdmin: Types.UUID;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
   
    type: { type: String, enum: ["group", "private"], default: "private", required: true },
    participants: [{ type: Schema.Types.UUID, ref: "User", required: true }],
    status: { type: String, enum: ["active", "archived"], default: "active" },
    groupInfo: {
      groupName: { type: String, required: false },
      groupDescription: { type: String, required: false },
      groupAdmin: { type: Schema.Types.UUID, ref: "User", required: false },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ChannelSchema.pre<IChannel>("save", async function (next) {
  if (this.type === "group") {
    const { groupInfo } = this;
    const validationRules = [
      { condition: !groupInfo, message: "Group channels must have groupInfo" },
      { condition: !groupInfo?.groupName, message: "Group channels must have a groupName" },
      { condition: !groupInfo?.groupDescription, message: "Group channels must have a groupDescription" },
      
    ];

    const error = validationRules.find((rule) => rule.condition);
    if (error) return next(new Error(error.message));
  } else if (this.type === "private") {
    // Private channels should not have groupInfo
    if (this.groupInfo) {
      this.groupInfo = undefined;
    }
    
    // Check if a private channel with these participants already exists
    const existingChannel = await ChannelModel.findOne({
      type: "private",
      participants: { $all: this.participants },
      $expr: { $eq: [{ $size: "$participants" }, this.participants.length] }
    });

    if (existingChannel) {
      return next(new Error("A private channel with these participants already exists"));
    }
  }
  next();
});

ChannelSchema.index({ participants: 1});
export const ChannelModel = model<IChannel>("Channel", ChannelSchema);
