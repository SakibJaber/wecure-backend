const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkIndexes() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wecure';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    const collection = db.collection('appointments');

    // Get all indexes
    const indexes = await collection.listIndexes().toArray();

    console.log('\n=== Current Appointment Indexes ===');
    indexes.forEach((index) => {
      console.log(`Name: ${index.name}`);
      console.log(`Keys:`, index.key);
      console.log(`Unique: ${index.unique || false}`);
      console.log('---');
    });

    // Check for the required unique index
    const hasUniqueIndex = indexes.some(
      (idx) =>
        idx.key.doctorId &&
        idx.key.appointmentDate &&
        idx.key.appointmentTime &&
        idx.unique === true,
    );

    if (!hasUniqueIndex) {
      console.log(
        '\n⚠️  MISSING: Unique index on (doctorId, appointmentDate, appointmentTime)',
      );
      console.log('\nCreating the missing index...');

      await collection.createIndex(
        { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
        { unique: true },
      );

      console.log('✅ Index created successfully!');
    } else {
      console.log('\n✅ All required indexes exist');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

checkIndexes();
