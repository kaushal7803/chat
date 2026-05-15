import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMessage extends Document {
  roomId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'system' | 'image' | 'file';
  fileUrl?: string;
  isEdited: boolean;
  reactions: {
    emoji: string;
    users: mongoose.Types.ObjectId[];
  }[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'system', 'image', 'file'], default: 'text' },
    fileUrl: { type: String },
    isEdited: { type: Boolean, default: false },
    reactions: [{
      emoji: { type: String, required: true },
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }]
    }]
  },
  { timestamps: true }
);

// Index for fast room message queries
MessageSchema.index({ roomId: 1, createdAt: -1 });

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
