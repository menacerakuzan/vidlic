export class ReportCreatedEvent {
  constructor(
    public readonly reportId: string,
    public readonly authorId: string,
  ) {}
}

export class ReportSubmittedEvent {
  constructor(
    public readonly reportId: string,
    public readonly authorId: string,
    public readonly approverId?: string | null,
  ) {}
}

export class ReportApprovedEvent {
  constructor(
    public readonly reportId: string,
    public readonly actorId: string,
    public readonly authorId: string,
    public readonly nextApproverId?: string | null,
  ) {}
}

export class ReportRejectedEvent {
  constructor(
    public readonly reportId: string,
    public readonly actorId: string,
    public readonly authorId: string,
    public readonly comment: string,
  ) {}
}
