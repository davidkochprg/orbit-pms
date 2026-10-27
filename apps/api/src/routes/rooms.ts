import type { Repositories } from '@orbit/domain';
import { Hono } from 'hono';
import { notFound } from '../http';

export function roomRoutes(repos: Repositories) {
  return new Hono()
    .get('/room-types', async (c) => c.json(await repos.rooms.listRoomTypes()))
    .get('/rooms', async (c) => c.json(await repos.rooms.listRooms()))
    .get('/rooms/:id', async (c) => {
      const room = await repos.rooms.getRoom(c.req.param('id'));
      return room ? c.json(room) : notFound(c, 'Room');
    });
}
