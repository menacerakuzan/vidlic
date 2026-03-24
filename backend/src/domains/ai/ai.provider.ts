import { Injectable } from '@nestjs/common';

export interface AiSummaryInput {
  title?: string;
  content: Record<string, any>;
  language?: string;
}

export interface AiSummaryOutput {
  summary: string;
  highlights: string[];
  risks: string[];
  nextSteps: string[];
}

export interface ManagerSubmissionInput {
  title: string;
  periodLabel: string;
  departmentFullName: string;
  reportContent: Record<string, any>;
  authorName?: string;
  customPrompt?: string;
  sectionSchema?: any[];
}

export interface ManagerSubmissionOutput {
  documentTitle: string;
  headerLines: string[];
  bodyText: string;
  style: {
    fontFamily: string;
    fontSize: number;
  };
}

@Injectable()
export class AiProviderService {
  private readonly provider = (this.clean(process.env.AI_PROVIDER) || 'auto').toLowerCase();
  private readonly endpoint = this.clean(process.env.AI_PROVIDER_URL);
  private readonly openAiApiKey = this.clean(process.env.OPENAI_API_KEY);
  private readonly openAiModel = this.clean(process.env.OPENAI_MODEL) || 'gpt-4o-mini';
  private readonly geminiApiKey = this.clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  private readonly geminiModel = this.clean(process.env.GEMINI_MODEL) || 'gemini-2.0-flash';

  async summarize(input: AiSummaryInput): Promise<AiSummaryOutput | null> {
    if (this.provider === 'openai') {
      return this.openAiApiKey ? this.callOpenAiSummary(input) : null;
    }
    if (this.provider === 'gemini' || this.provider === 'google') {
      return this.geminiApiKey ? this.callGemini(input) : null;
    }
    if (this.provider === 'generic' || this.provider === 'custom') {
      return this.endpoint ? this.callGenericProvider(input) : null;
    }

    if (this.endpoint) {
      const generic = await this.callGenericProvider(input);
      if (generic) return generic;
    }

    if (this.openAiApiKey) {
      const openAi = await this.callOpenAiSummary(input);
      if (openAi) return openAi;
    }

    if (this.geminiApiKey) {
      return this.callGemini(input);
    }

    return null;
  }

  async buildManagerSubmission(input: ManagerSubmissionInput): Promise<ManagerSubmissionOutput | null> {
    if (this.provider === 'openai') {
      return this.openAiApiKey ? this.callOpenAiManagerSubmission(input) : null;
    }
    if (this.provider === 'gemini' || this.provider === 'google') {
      return this.geminiApiKey ? this.callGeminiManagerSubmission(input) : null;
    }
    if (this.provider === 'generic' || this.provider === 'custom') {
      return this.endpoint ? this.callGenericManagerSubmission(input) : null;
    }

    if (this.endpoint) {
      const generic = await this.callGenericManagerSubmission(input);
      if (generic) return generic;
    }

    if (this.openAiApiKey) {
      const openAi = await this.callOpenAiManagerSubmission(input);
      if (openAi) return openAi;
    }

    if (this.geminiApiKey) {
      return this.callGeminiManagerSubmission(input);
    }

    return null;
  }

  private async callGenericProvider(input: AiSummaryInput): Promise<AiSummaryOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetchFn(this.endpoint as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'summary',
          payload: input,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = await response.json();

      if (!data?.summary) return null;

      return {
        summary: data.summary,
        highlights: data.highlights || [],
        risks: data.risks || [],
        nextSteps: data.nextSteps || [],
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGenericManagerSubmission(input: ManagerSubmissionInput): Promise<ManagerSubmissionOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetchFn(this.endpoint as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'manager_submission',
          payload: input,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.bodyText) return null;

      return {
        documentTitle: data.documentTitle || 'ЗВIТ',
        headerLines: Array.isArray(data.headerLines) ? data.headerLines : [],
        bodyText: data.bodyText,
        style: {
          fontFamily: data.style?.fontFamily || 'Times New Roman',
          fontSize: Number(data.style?.fontSize) || 14,
        },
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGemini(input: AiSummaryInput): Promise<AiSummaryOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const prompt = [
      'You are an enterprise analytics assistant. Summarize the report content in Ukrainian.',
      'Return a strict JSON object with keys: summary, highlights (array), risks (array), nextSteps (array).',
      `Title: ${input.title || ''}`,
      `Content: ${JSON.stringify(input.content || {})}`,
    ].join('\n');

    try {
      const models = this.buildModelFallbacks();
      for (const model of models) {
        const response = await fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.geminiApiKey as string,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, response_mime_type: 'application/json' },
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        const parsed = this.safeJson(text);
        if (!parsed) continue;

        return {
          summary: parsed.summary || '',
          highlights: parsed.highlights || [],
          risks: parsed.risks || [],
          nextSteps: parsed.nextSteps || [],
        };
      }

      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGeminiManagerSubmission(input: ManagerSubmissionInput): Promise<ManagerSubmissionOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const prompt = this.buildManagerSubmissionPrompt(input);

    try {
      const models = this.buildModelFallbacks();
      for (const model of models) {
        const response = await fetchFn(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.geminiApiKey as string,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, response_mime_type: 'application/json' },
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        const parsed = this.safeJson(text);
        if (!parsed?.bodyText) continue;

        return {
          documentTitle: parsed.documentTitle || 'ЗВІТ',
          headerLines: Array.isArray(parsed.headerLines) ? parsed.headerLines : [],
          bodyText: String(parsed.bodyText),
          style: {
            fontFamily: parsed.style?.fontFamily || 'Times New Roman',
            fontSize: Number(parsed.style?.fontSize) || 14,
          },
        };
      }

      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAiSummary(input: AiSummaryInput): Promise<AiSummaryOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const prompt = [
      'You are an enterprise analytics assistant.',
      'Summarize the report content in Ukrainian.',
      'Return strict JSON with keys: summary, highlights (array), risks (array), nextSteps (array).',
      `Title: ${input.title || ''}`,
      `Content: ${JSON.stringify(input.content || {})}`,
    ].join('\n');

    try {
      const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: this.openAiModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) return null;

      const parsed = this.safeJson(text);
      if (!parsed) return null;

      return {
        summary: parsed.summary || '',
        highlights: parsed.highlights || [],
        risks: parsed.risks || [],
        nextSteps: parsed.nextSteps || [],
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAiManagerSubmission(input: ManagerSubmissionInput): Promise<ManagerSubmissionOutput | null> {
    const fetchFn = (...args: any[]) => (global as any).fetch(...args);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const prompt = this.buildManagerSubmissionPrompt(input);

    try {
      const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: this.openAiModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) return null;

      const parsed = this.safeJson(text);
      if (!parsed?.bodyText) return null;

      return {
        documentTitle: parsed.documentTitle || 'ЗВІТ',
        headerLines: Array.isArray(parsed.headerLines) ? parsed.headerLines : [],
        bodyText: String(parsed.bodyText),
        style: {
          fontFamily: parsed.style?.fontFamily || 'Times New Roman',
          fontSize: Number(parsed.style?.fontSize) || 14,
        },
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildManagerSubmissionPrompt(input: ManagerSubmissionInput): string {
    return [
      'Ти — головний спеціаліст з підготовки офіційної звітності в Органах державної адміністрації (ОДА).',
      'Твоє завдання: перетворити вхідні тези на розлогий, офіційно-діловий звіт, дотримуючись суворого стилю та професійної лексики ("канцеляризмів").',
      '',
      "ОБОВ'ЯЗКОВІ ПАРАМЕТРИ ФОРМУВАННЯ:",
      '1. Оформлення:',
      '   - Шрифт: Times New Roman.',
      '   - Розмір: 14.',
      '   - Мова: Українська (офіційна).',
      '2. Структура документа:',
      '   - Рядок 1: ЗВІТ',
      '   - Рядок 2: Про виконання роботи [ВСТАВИТИ НАЗВУ ДЕПАРТАМЕНТУ]',
      '   - Рядок 3: [ВСТАВИТИ ПЕРІОД]',
      '   - Назва звіту: [ВСТАВИТИ НАЗВУ]',
      '   - Автор: [ВСТАВИТИ ПРІЗВИЩЕ ТА ІНІЦІАЛИ]',
      `   - НАЗВА ДЕПАРТАМЕНТУ: ${input.departmentFullName}`,
      `   - ПЕРІОД: ${input.periodLabel}`,
      `   - НАЗВА ЗВІТУ: ${input.title}`,
      `   - АВТОР: ${input.authorName || 'невказано'}`,
      '4. Стиль викладу ("Роздування об\'єму"):',
      '   - Кожну тезу перетворюй на складне речення (мінімум 30-40 слів).',
      '   - Використовуй формулу: [Дія] + [Об\'єкт] + [Мета] + [Очікуваний результат/Статус].',
      '   - Замість "зробив" пиши: "Забезпечено виконання заходів щодо...", "Здійснено комплексний моніторинг...", "У межах реалізації стратегії впроваджено...".',
      '   - Додавай "адміністративну воду": "з метою підвищення операційної ефективності", "відповідно до встановлених регламентів", "у межах цифрової трансформації регіону".',
      '   - Заборонено повторювати один і той самий початок речення в сусідніх пунктах; варіюй синтаксис.',
      '   - Не створюй окремі пункти для службових слів: "на даний момент", "наступні етапи", "поточний стан".',
      '   - Об\'єднуй короткі суміжні тези в один змістовний пункт, щоб уникати дрібного дроблення.',
      input.customPrompt ? `5. Додаткові вимоги департаменту:\n${input.customPrompt}` : '',
      Array.isArray(input.sectionSchema) && input.sectionSchema.length
        ? `6. Рекомендована структура секцій (JSON): ${JSON.stringify(input.sectionSchema)}`
        : '',
      '',
      'ВХІДНІ ДАНІ ДЛЯ ОБРОБКИ:',
      JSON.stringify(input.reportContent || {}),
      '',
      'ПОВЕРНИ СТРОГО JSON БЕЗ MARKDOWN з ключами: documentTitle, headerLines (масив), bodyText, style.',
      'style має містити: fontFamily="Times New Roman", fontSize=14.',
      'documentTitle має бути "ЗВІТ".',
      'headerLines[0] має бути "Про виконання роботи <НАЗВА ДЕПАРТАМЕНТУ>".',
      'headerLines[1] має бути "<ПЕРІОД>".',
      'Не додавай пояснень, коментарів, прикладів коду або будь-якого тексту поза JSON.',
    ].join('\n');
  }

  private buildModelFallbacks(): string[] {
    const models = [this.geminiModel, 'gemini-1.5-flash', 'gemini-1.5-pro'];
    return [...new Set(models.filter(Boolean))];
  }

  private enforceOfficialStyle(text: string, reportContent: Record<string, any>): string {
    const cleanedText = text.trim();
    const normalized = cleanedText.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ').filter(Boolean).length;
    const sentenceCount = (cleanedText.match(/[.!?]\s/g) || []).length + 1;
    const hasOfficialMarkers =
      /з метою|відповідно до|у межах|забезпечено|здійснено|організовано|підготовлено|проведено/i.test(normalized);
    const hasStructure = /^\d+\.\s/m.test(cleanedText) || /\n\d+\.\s/m.test(cleanedText);
    const rawOutline = this.isRawOutlineText(cleanedText);

    // Keep AI output if it is already sufficiently detailed and structured.
    if (
      !rawOutline &&
      ((words >= 90 && sentenceCount >= 4 && hasOfficialMarkers) || (words >= 120 && hasStructure))
    ) {
      return cleanedText;
    }

    const sections = this.extractSectionedPoints(reportContent);
    if (!sections.length) {
      const points = this.extractInputPoints(reportContent);
      if (!points.length) {
        return cleanedText;
      }
      sections.push({
        title: 'Сектор цифрових трансформацій та інформатизації',
        points,
      });
    }

    if (!sections.some((section) => section.points.length > 0)) {
      return cleanedText;
    }

    const lines: string[] = [];
    const introPhrases = [
      'Забезпечено виконання комплексу заходів щодо',
      'Організовано та проведено роботу за напрямом',
      'У межах реалізації функціональних повноважень опрацьовано питання',
      'Здійснено практичні заходи стосовно',
      'Підготовлено та реалізовано управлінські дії щодо',
      'Проведено координацію робіт у частині',
    ];
    const goalPhrases = [
      'з метою підвищення операційної ефективності',
      'з метою забезпечення належної міжвідомчої координації',
      'для досягнення стабільного функціонування відповідних процесів',
      'для дотримання встановлених організаційних і технічних регламентів',
      'з урахуванням пріоритетів цифрової трансформації регіону',
      'для своєчасного виконання визначених планових завдань',
    ];
    const resultPhrases = [
      'у результаті чого сформовано практичний базис для подальших управлінських рішень.',
      'що забезпечило керованість процесу та передумови для поетапного масштабування відповідних рішень.',
      'що дало змогу підтримати безперервність виконання завдань у визначені терміни.',
      'за підсумком чого підтверджено готовність до подальшої реалізації пріоритетних ініціатив.',
      'що сприяло підвищенню якості внутрішнього контролю та звітності за напрямом.',
      'що дозволило консолідувати необхідні дані для подальшого планування та моніторингу.',
    ];

    sections.forEach((section, sectionIndex) => {
      if (!section.points.length) return;
      lines.push(`${sectionIndex + 1}. ${section.title}`);
      section.points.forEach((point, index) => {
        const styleIndex = (sectionIndex * 7 + index) % introPhrases.length;
        const intro = introPhrases[styleIndex];
        const goal = goalPhrases[styleIndex % goalPhrases.length];
        const result = resultPhrases[styleIndex % resultPhrases.length];
        lines.push(
          `${index + 1}. ${intro} ${point.toLowerCase()}, ${goal}, відповідно до встановлених регламентів діяльності та у межах виконання поточних планових завдань, ${result}`,
        );
      });
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  private extractInputPoints(reportContent: Record<string, any>): string[] {
    const candidateKeys = [
      'workDone',
      'achievements',
      'problems',
      'nextWeekPlan',
      'summary',
      'details',
      'result',
      'notes',
    ];
    const raw = candidateKeys
      .map((key) => reportContent?.[key])
      .filter(Boolean)
      .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)));

    const seen = new Set<string>();
    const points: string[] = [];

    for (const value of raw) {
      const chunks = String(value)
        .split(/\n|;/)
        .map((item) =>
          item
            .replace(/^\s*[-*•]\s*/, '')
            .replace(/^\s*\d+[\).\s-]*/, '')
            .trim(),
        )
        .filter(Boolean);

      for (const chunk of chunks) {
        if (this.isNoisePoint(chunk)) continue;
        const key = chunk.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        points.push(chunk);
        if (points.length >= 18) {
          return points;
        }
      }
    }

    return points;
  }

  private extractSectionedPoints(reportContent: Record<string, any>): Array<{ title: string; points: string[] }> {
    const candidateKeys = ['workDone', 'achievements', 'problems', 'nextWeekPlan', 'summary', 'details', 'result', 'notes'];
    const source = candidateKeys
      .map((key) => reportContent?.[key])
      .filter(Boolean)
      .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
      .join('\n');

    if (!source.trim()) return [];

    const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
    const sections: Array<{ title: string; points: string[]; seen: Set<string> }> = [];
    let current = {
      title: 'Сектор цифрових трансформацій та інформатизації',
      points: [] as string[],
      seen: new Set<string>(),
    };

    for (const line of lines) {
      const normalizedLine = line.replace(/^\s*\d+[\).\s-]*/, '').trim();
      if (!normalizedLine) continue;

      if (this.isSectionTitle(normalizedLine)) {
        if (current.points.length > 0 || current.title !== 'Сектор цифрових трансформацій та інформатизації') {
          sections.push(current);
        }
        current = { title: normalizedLine, points: [], seen: new Set<string>() };
        continue;
      }

      if (this.isNoisePoint(normalizedLine)) continue;

      const key = normalizedLine.toLowerCase();
      if (!current.seen.has(key)) {
        current.seen.add(key);
        current.points.push(normalizedLine);
      }
    }

    if (current.points.length > 0 || sections.length === 0) {
      sections.push(current);
    }

    return sections
      .map((section) => ({ title: section.title, points: section.points.slice(0, 10) }))
      .filter((section) => section.points.length > 0)
      .slice(0, 4);
  }

  private isSectionTitle(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
    return /^(сектор|відділ|департамент|управління)\b/.test(normalized);
  }

  private isRawOutlineText(text: string): boolean {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 4) return false;

    const listLineCount = lines.filter((line) => /^\d+\.\s/.test(line)).length;
    const shortLineCount = lines.filter((line) => line.length < 110).length;
    const markerCount = lines.filter((line) => /(на даний момент|наступні етапи|поточний стан)\s*:?\s*$/i.test(line)).length;
    const semicolonCount = lines.filter((line) => /;\s*$/.test(line)).length;
    const longSentenceCount = lines.filter((line) => /[.!?]/.test(line) && line.length > 140).length;

    return (
      listLineCount >= Math.floor(lines.length * 0.45) &&
      shortLineCount >= Math.floor(lines.length * 0.55) &&
      (markerCount > 0 || semicolonCount > 1 || longSentenceCount < 2)
    );
  }

  private isNoisePoint(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return true;
    if (normalized.length < 8) return true;
    if (/^https?:\/\//.test(normalized)) return true;
    if (/^(на даний момент|наразі|наступні етапи|етапи реалізації|поточний стан)[:\s]*$/.test(normalized)) {
      return true;
    }
    return false;
  }

  private clean(value?: string): string {
    return (value || '').trim();
  }

  private safeJson(text: string): any | null {
    try {
      const trimmed = text.trim();
      return JSON.parse(trimmed);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
}
