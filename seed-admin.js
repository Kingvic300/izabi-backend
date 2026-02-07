const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// User Schema (simplified - matches your user.entity.ts)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'USER' },
  firstName: String,
  lastName: String,
  isVerified: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  dailyPoints: { type: Number, default: 0 },
  dailyDocs: { type: Number, default: 0 },
  dailyMessages: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  totalStudyMinutes: { type: Number, default: 0 },
  studyStats: { type: Object, default: { summaries: 0, quizzes: 0, guides: 0, flashcards: 0 } },
  pet: { type: Object, default: { name: 'Izabi Pet', type: 'owl', level: 1, mood: 'happy' } },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function seedAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/izabi';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const adminEmail = 'admin@izabi.com';
    const adminPassword = 'IzabiAdmin@2024';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (existingAdmin) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('ℹ️  Admin user already exists!');
      console.log('📧 Email:', adminEmail);
      console.log('👤 Role:', existingAdmin.role);
      console.log('✓ Verified:', existingAdmin.isVerified);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Update admin if needed
      if (!existingAdmin.isVerified || existingAdmin.role !== 'ADMIN') {
        existingAdmin.isVerified = true;
        existingAdmin.role = 'ADMIN';
        await existingAdmin.save();
        console.log('✅ Admin user updated and verified!');
      }
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      const adminUser = new User({
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        firstName: 'System',
        lastName: 'Administrator',
        isVerified: true,
      });

      await adminUser.save();

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Admin user created successfully!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', adminEmail);
      console.log('🔑 Password:', adminPassword);
      console.log('👤 Role: ADMIN');
      console.log('✓ Verified: true');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('🎯 You can now login with these credentials!');
      console.log('');
    }

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    console.log('🎉 Admin seeding completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedAdmin();
