import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dayjs from 'dayjs';

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();
dayjs();

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
  await mongoClient.connect();
  console.log('MongoDB connected!');
} catch (err) {
  console.log(err.message);
}

const db = mongoClient.db();

app.post('/participants', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(422).send('Preencha o nome corretamente!');
  }

  try {
    const participant = await db.collection('participants').findOne({ name });
    if (participant) {
      return res.status(409).send('Já existe um participante com esse nome!');
    }

    await db.collection('participants').insertOne({
      name,
      lastStatus: Date.now(),
    });

    await db.collection('messages').insertOne({
      from: name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs().format('HH:mm:ss'),
    });

    res.sendStatus(201);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send();
  }
})

app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.send(participants);
  } catch (error) {
    res.status(500).send(error.message);
  }
})




const PORT = 5000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
