import assert from 'node:assert/strict';
import test from 'node:test';
import { clauses, ranges, script, segments, splitTitle } from './typeset.ts';

const shape = (text: string) => segments(text).map((s) => (s.kind === 'wbr' ? '|' : s.kind === 'text' ? s.text : `[${s.text}]`)).join('');

test('script tells Han titles from Latin ones', () => {
  assert.equal(script('具身智能与医疗'), 'han');
  assert.equal(script('Efficient VLA'), 'latin');
  assert.equal(script('VLA 模型'), 'han');
});

test('hyphenated compounds stay whole and the CJK double dash is one rule', () => {
  assert.equal(shape('Vision-Language-Action Models'), '[Vision-Language-Action] Models');
  assert.equal(shape('综述——特征涌现'), '综述[——]特征涌现');
});

test('Han phrases break after 的 and before a standalone 与/和/或/及其', () => {
  assert.equal(shape('分层的具身医疗智能'), '分层的|具身医疗智能');
  assert.equal(shape('医疗与具身智能'), '医疗|与具身智能');
  assert.equal(shape('模型及其应用'), '模型|及其应用');
});

test('words that merely contain 与 or 及 are never split', () => {
  for (const word of ['曾参与项目', '医疗可及性', '以及', '涉及模型', '普及应用']) assert.equal(shape(word), word, word);
});

test('splitTitle drops a dash or colon subtitle to a second line', () => {
  assert.deepEqual(splitTitle('主标题——副标题'), { main: '主标题', sub: '——副标题' });
  assert.deepEqual(splitTitle('Feature Emergence: A Survey'), { main: 'Feature Emergence:', sub: 'A Survey' });
  assert.deepEqual(splitTitle('标题: 不拆'), { main: '标题: 不拆' });
});

test('ranges get an en dash, compounds do not', () => {
  assert.equal(ranges('2025-26'), '2025–26');
  assert.equal(ranges('2025.07-08'), '2025.07–08');
  assert.equal(ranges('Jul-Aug 2025'), 'Jul–Aug 2025');
  assert.equal(ranges('Vision-Language'), 'Vision-Language');
});

test('clauses split after commas and keep them', () => {
  assert.deepEqual(clauses('关注医疗AI与具身智能，曾参与VLA与Agent方面项目'), [
    { text: '关注医疗AI与具身智能，', gap: '' },
    { text: '曾参与VLA与Agent方面项目', gap: '' },
  ]);
  assert.deepEqual(clauses('Medical AI, embodied agents'), [
    { text: 'Medical AI,', gap: ' ' },
    { text: 'embodied agents', gap: '' },
  ]);
});
