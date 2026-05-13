export class TaskCreatedEvent {
  constructor(
    public readonly taskId: string,
    public readonly reporterId: string,
    public readonly assigneeId?: string | null,
    public readonly coAssigneeIds?: string[],
  ) {}
}

export class TaskUpdatedEvent {
  constructor(
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly newAssigneeId?: string | null,
  ) {}
}

export class TaskCompletedEvent {
  constructor(
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly reporterId: string,
  ) {}
}

export class TaskStatusChangedEvent {
  constructor(
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly newStatus: string,
  ) {}
}

export class TaskCommentEvent {
  constructor(
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly commentContent: string,
  ) {}
}
