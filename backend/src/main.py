from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from prisma import Prisma
from pydantic import BaseModel, ConfigDict, Field

db = Prisma()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="Taskboard API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    status: Literal["TODO", "IN_PROGRESS", "DONE"] = "TODO"


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    status: Literal["TODO", "IN_PROGRESS", "DONE"] | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str | None
    status: str
    createdAt: datetime
    updatedAt: datetime


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/tasks", response_model=list[TaskResponse])
async def list_tasks():
    return await db.task.find_many(order={"updatedAt": "desc"})


@app.post("/api/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate):
    return await db.task.create(data=payload.model_dump())


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: int, payload: TaskUpdate):
    if await db.task.find_unique(where={"id": task_id}) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return await db.task.update(where={"id": task_id}, data=payload.model_dump(exclude_unset=True))


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int):
    if await db.task.find_unique(where={"id": task_id}) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.task.delete(where={"id": task_id})
