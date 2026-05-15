const mongoose = require('mongoose');

// Define minimal schemas for the script to ensure Mongoose doesn't complain
const RoomSchema = new mongoose.Schema({}, { strict: false });
const UserSchema = new mongoose.Schema({}, { strict: false });
const MessageSchema = new mongoose.Schema({}, { strict: false });

const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema, 'rooms');
const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema, 'messages');

async function run() {
  const uri = 'mongodb://localhost:27017/chatapp';
  
  try {
    console.log('⏳ Connecting to MongoDB via Mongoose...');
    await mongoose.connect(uri);
    console.log('✅ Connected successfully.');

    // 1. Find a room
    const rooms = await Room.find().lean();
    if (rooms.length === 0) {
      console.error('❌ No rooms found! Please create a room in the app first.');
      process.exit(1);
    }
    const room = rooms.find(r => !r.isDM) || rooms[0];
    console.log(`\n📍 Target Room: "${room.name || 'DM'}" (${room._id})`);

    // 2. Find an active user to attribute
    const users = await User.find().lean();
    if (users.length === 0) {
      console.error('❌ No users found! Log in first.');
      process.exit(1);
    }
    const targetUser = users[0];
    console.log(`👤 User Attribution: "${targetUser.name}" (${targetUser._id})`);

    // 3. Clean old staged messages
    const deleteRes = await Message.deleteMany({
      content: { $regex: 'Staging Log Sequence' }
    });
    console.log(`🧹 Cleaned up ${deleteRes.deletedCount} old staging logs.`);

    // 4. Generate 200 test items
    const count = 200;
    const messageDocs = [];
    const now = new Date();

    console.log(`🔨 Seeding ${count} sequentially timed messages...`);
    for (let i = count; i > 0; i--) {
      const timeOffset = new Date(now.getTime() - (i * 60000)); // 1 min spacing backward
      messageDocs.push({
        roomId: room._id.toString(),
        sender: targetUser._id,
        content: `📊 Staging Log Sequence #${count - i + 1} - Dynamic infinite scroll validation block.`,
        type: 'text',
        isEdited: false,
        reactions: [],
        createdAt: timeOffset,
        updatedAt: timeOffset
      });
    }

    const insertRes = await Message.insertMany(messageDocs);
    console.log(`🎉 Successfully injected ${insertRes.length} historical messages!`);
    console.log(`\n🏁 WHAT TO DO NOW:`);
    console.log(`   Open your browser at http://localhost:3000/chat/${room._id}`);
    console.log(`   Scroll UPWARDS to see the seamless pagination in action! 🚀`);

  } catch (err) {
    console.error('❌ Staging crash:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
