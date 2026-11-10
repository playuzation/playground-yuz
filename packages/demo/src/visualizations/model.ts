export type Diagram = 'flow' | 'array' | 'bars' | 'tree' | 'network' | 'grid' | 'plot';
export interface Frame {
  caption: string;
  items: string[];
}
export interface Lesson {
  key: string;
  diagram: Diagram;
  subject: string;
  frames: Frame[];
  note: string;
}

/** 직접 작성한 장면. !로 시작하는 칸은 현재 다루는 대상이다. */
export function lesson(key: string, diagram: Diagram, subject: string, frames: string[], note = ''): Lesson {
  return {
    key, diagram, subject, note,
    frames: frames.map((frame) => {
      const [caption, ...parts] = frame.split('|');
      return { caption: caption!, items: parts.join('|').split(',').map((s) => s.trim()) };
    }),
  };
}

export function validateLessons(lessons: Lesson[]): Map<string, Lesson> {
  const byKey = new Map<string, Lesson>();
  for (const l of lessons) {
    if (byKey.has(l.key)) throw new Error(`중복 시각화: ${l.key}`);
    if (!/^[a-z]+\/[1-9]\d*$/.test(l.key) || !l.subject || l.frames.length < 3) throw new Error(`잘못된 시각화: ${l.key}`);
    for (const f of l.frames) {
      if (!f.caption || !f.items.length || f.items.some((x) => !x)) throw new Error(`빈 장면: ${l.key}`);
      if (['bars', 'plot'].includes(l.diagram) && f.items.some((x) => !Number.isFinite(Number(x.replace(/^!/, '').split('=').at(-1))))) {
        throw new Error(`숫자가 아닌 차트 값: ${l.key}`);
      }
    }
    byKey.set(l.key, l);
  }
  return byKey;
}
