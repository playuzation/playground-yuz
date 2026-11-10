import { foundations } from './foundations.ts';
import { algorithms } from './algorithms.ts';
import { structures } from './structures.ts';
import { hardware } from './hardware.ts';
import { machineLearning } from './machine-learning.ts';
import { games } from './games.ts';
import { validateLessons } from './model.ts';

export const lessons = [...foundations, ...algorithms, ...structures, ...hardware, ...machineLearning, ...games];
export const byKey = validateLessons(lessons);
