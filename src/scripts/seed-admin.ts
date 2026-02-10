import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const adminEmail = 'admin@izabi.com';
  const adminPassword = 'IzabiAdmin@2024';

  try {
    // Check if admin already exists
    const existingAdmin = await usersService.findByEmail(adminEmail);

    if (existingAdmin) {
      console.log('✅ Admin user already exists!');
      console.log('Email:', adminEmail);
      console.log('Role:', existingAdmin.role);
      console.log('Verified:', existingAdmin.isVerified);

      // Update admin if needed
      if (!existingAdmin.isVerified || existingAdmin.role !== 'ADMIN') {
        await usersService.verifyUser(adminEmail);
        console.log('✅ Admin user updated and verified!');
      }
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      const adminUser = await usersService.create({
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
      });

      // Verify the admin user immediately (skip OTP)
      await usersService.verifyUser(adminEmail);

      console.log('✅ Admin user created successfully!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', adminEmail);
      console.log('🔑 Password:', adminPassword);
      console.log('👤 Role: ADMIN');
      console.log('✓ Verified: true');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message);
  } finally {
    await app.close();
  }
}

seedAdmin()
  .then(() => {
    console.log('🎉 Admin seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed to seed admin:', error);
    process.exit(1);
  });
