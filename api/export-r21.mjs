import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import templateBase64 from './r21-template-base64.mjs';

const XML_ESCAPE = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function setCell(xml, ref, value, numeric = false) {
  const cell = numeric
    ? `<x:c r="${ref}"><x:v>${Number(value) || 0}</x:v></x:c>`
    : `<x:c r="${ref}" t="inlineStr"><x:is><x:t xml:space="preserve">${XML_ESCAPE(value)}</x:t></x:is></x:c>`;
  const pattern = new RegExp(`<(?:\\w+:)?c\\b(?=[^>]*\\br="${ref}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/(?:\\w+:)?c>)`);
  if (!pattern.test(xml)) throw new Error(`R21 template cell ${ref} is missing.`);
  return xml.replace(pattern, cell);
}

function worksheetPath(files) {
  const workbook = strFromU8(files['xl/workbook.xml']);
  const escapedName = 'IATF 16949'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheet = workbook.match(new RegExp(`<(?:\\w+:)?sheet\\b(?=[^>]*name="${escapedName}")(?=[^>]*r:id="([^"]+)")[^>]*/>`));
  if (!sheet) throw new Error('IATF 16949 worksheet is missing from the R21 template.');
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rel = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].find(match =>
    new RegExp(`\\bId="${sheet[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(match[0]));
  const target = rel?.[0].match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error('IATF worksheet relationship is invalid.');
  return `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = req.body || {};
    const files = unzipSync(new Uint8Array(Buffer.from(templateBase64, 'base64')));
    const path = worksheetPath(files);
    let xml = strFromU8(files[path]);
    const fields = [
      ['B2', data.organization || '', false], ['B3', data.scope || '', false],
      ['B4', Math.max(1, Math.floor(Number(data.employees) || 1)), true],
      ['B5', ['IA', 'SA', 'RA'].includes(data.auditType) ? data.auditType : 'IA', false],
      ['B6', data.designResponsibility === 'Yes' ? 'Yes' : 'No', false],
      ['B7', Math.min(1, Math.max(0, Number(data.otherReduction) || 0)), true],
      ['B8', Math.max(0, Math.floor(Number(data.previousMinorNc) || 0)), true],
      ['B9', Math.min(1, Math.max(.5, Number(data.ncHours) || .5)), true],
      ['B10', Math.max(0, Number(data.otherAdditionalHours) || 0), true]
    ];
    for (const field of fields) xml = setCell(xml, ...field);
    files[path] = strToU8(xml);
    let workbook = strFromU8(files['xl/workbook.xml']);
    const calcPr = '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
    workbook = /<(?:\w+:)?calcPr\b/.test(workbook)
      ? workbook.replace(/<(?:\w+:)?calcPr\b[^>]*\/>/, calcPr)
      : workbook.replace('</x:workbook>', `${calcPr}</x:workbook>`);
    files['xl/workbook.xml'] = strToU8(workbook);
    const output = Buffer.from(zipSync(files, { level: 6 }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''UCS-D-053_R21_IATF.xlsx");
    return res.status(200).send(output);
  } catch (error) {
    console.error('R21 export failed', error);
    return res.status(500).json({ error: '無法產生 R21 驗證人天表，請稍後再試。' });
  }
}

