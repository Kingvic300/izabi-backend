const mongoose = require('mongoose');

async function run() {
  const uri = "mongodb+srv://Kingvic:Kingvic300@student-app.cqzbps5.mongodb.net/StudentApp?retryWrites=true&w=majority&appName=Student-App";
  
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB");

    const UserSchema = new mongoose.Schema({
        geminiApiKey: String
    });

    const User = mongoose.model('User', UserSchema);

    const suspendedKey = 'AIzaSyAv6VA8VBLwWwVY5Q_hsj2iQITyJ_CvBDs';
    
    // Find users with the suspended key
    const usersWithKey = await User.find({ geminiApiKey: suspendedKey });

    if (usersWithKey.length > 0) {
      console.log(`Found ${usersWithKey.length} user(s) with suspended key. Clearing it...`);
      const result = await User.updateMany({ geminiApiKey: suspendedKey }, { $unset: { geminiApiKey: "" } });
      console.log(`Updated ${result.modifiedCount} document(s).`);
    } else {
      console.log("No user found with that suspended key in the database.");
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
  }
}

run();
