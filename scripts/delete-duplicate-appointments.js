const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function deleteDuplicates() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wecure';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    const collection = db.collection('appointments');

    // Find all appointments
    const appointments = await collection.find({}).toArray();

    console.log(`\nTotal appointments: ${appointments.length}`);

    // Group by doctor + date + time
    const grouped = {};
    appointments.forEach((appt) => {
      const key = `${appt.doctorId}_${appt.appointmentDate.toISOString()}_${appt.appointmentTime}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(appt);
    });

    // Find duplicates
    let duplicateCount = 0;
    let idsToDelete = [];

    Object.entries(grouped).forEach(([key, appts]) => {
      if (appts.length > 1) {
        console.log(`\n⚠️  Found ${appts.length} duplicates for: ${key}`);
        // Keep the first one, delete the rest
        appts.slice(1).forEach((appt) => {
          console.log(`  Marking for deletion: ${appt._id}`);
          idsToDelete.push(appt._id);
          duplicateCount++;
        });
      }
    });

    if (duplicateCount > 0) {
      console.log(`\n\nDeleting ${duplicateCount} duplicate appointments...`);
      const result = await collection.deleteMany({
        _id: { $in: idsToDelete },
      });
      console.log(`✅ Deleted ${result.deletedCount} duplicates`);
    } else {
      console.log('\n✅ No duplicates found');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

deleteDuplicates();
