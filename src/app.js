import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import Joi from 'joi';
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

  const participantsSchema = Joi.object({
    name: Joi.string().min(1).required()
  })

  const validation = participantsSchema.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map(detail => detail.message);
    return res.status(422).send(errors);
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
  } catch (err) {
    console.log(err.message);
    res.status(500).send();
  }
})
    
app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.send(participants);
  } catch (err) {
    res.status(500).send(err.message);
  }
})

app.post('/messages', async (req, res) => {
  const { to, text, type } = req.body;
  const from = req.header.user;
  const messagesSchema = Joi.object({
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.string().valid('message', 'private_message').required()
  })

  const validation = messagesSchema.validate(req.body, { abortEarly: false });
  if(validation.error){
    const errors = validation.error.details.map(detail => detail.message);
    return res.status(422).send(errors);
  }

  try {
    await db.collection('messages').insertOne({
      from,
      to,
      text,
      type,
      time: dayjs().format('HH:mm:ss'),
    });
    
    res.sendStatus(201);
  } catch (err) {
    console.log(err.message);
    res.status(500).send(err.message);
  }
})

app.get('/messages', async (req, res) => {
  const user = req.header.user;
  const { limit } = req.query;

  try {
    let query = {
      $or: [
        { type: 'message' },
        { from: 'Todos' },
        { to: user },
        { from: user }
      ]
    };

    let messages = await db.collection('messages').find(query).toArray();

    if (limit) {
      const limitNumber = parseInt(limit);
      if (isNaN(limitNumber) || limitNumber <= 0) {
        return res.status(422).send('Limit deve ser um número inteiro positivo!');
      }
      messages = messages.slice(-limitNumber);
    }

    res.send(messages);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


const PORT = 5000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
