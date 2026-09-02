import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import templateBase64 from './r21-template-base64.mjs';

const XML_ESCAPE = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function setCell(xml, ref, value, numeric = false) {
  const marker = `r="${ref}"`, markerAt = xml.indexOf(marker);
  if (markerAt < 0) throw new Error(`R21 template cell ${ref} is missing.`);
  const prefixed = xml.lastIndexOf('<x:c', markerAt), plain = xml.lastIndexOf('<c', markerAt), start = Math.max(prefixed, plain);
  const openEnd = xml.indexOf('>', markerAt), selfClosing = xml[openEnd - 1] === '/';
  const closeTag = prefixed >= plain ? '</x:c>' : '</c>';
  const end = selfClosing ? openEnd + 1 : xml.indexOf(closeTag, openEnd) + closeTag.length;
  if (start < 0 || openEnd < 0 || end < openEnd) throw new Error(`R21 template cell ${ref} is invalid.`);
  const current = xml.slice(start, end), style = current.match(/\bs="([^"]+)"/)?.[1], styleAttr = style ? ` s="${style}"` : '';
  const cell = numeric
    ? `<x:c r="${ref}"${styleAttr}><x:v>${Number(value) || 0}</x:v></x:c>`
    : `<x:c r="${ref}"${styleAttr} t="inlineStr"><x:is><x:t xml:space="preserve">${XML_ESCAPE(value)}</x:t></x:is></x:c>`;
  return xml.slice(0, start) + cell + xml.slice(end);
}

function worksheetPath(files, name) {
  const workbook = strFromU8(files['xl/workbook.xml']);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheet = workbook.match(new RegExp(`<(?:\\w+:)?sheet\\b(?=[^>]*name="${escapedName}")(?=[^>]*r:id="([^"]+)")[^>]*/>`));
  if (!sheet) throw new Error(`${name} worksheet is missing from the R21 template.`);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rel = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].find(match =>
    new RegExp(`\\bId="${sheet[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(match[0]));
  const target = rel?.[0].match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`${name} worksheet relationship is invalid.`);
  return `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`;
}

function writeFields(files, sheetName, fields) {
  const path = worksheetPath(files, sheetName);
  let xml = strFromU8(files[path]);
  for (const field of fields) xml = setCell(xml, ...field);
  files[path] = strToU8(xml);
}

function targetSheet(data) {
  const multi = Number(data.sites) > 1;
  if (data.system === 'ISO 9001') return multi ? 'QMS多場區' : 'QMS單一場區';
  if (data.system === 'ISO 14001') return multi ? 'EMS多場區' : 'EMS單一場區';
  if (data.system === 'ISO 45001') return multi ? 'OHSMS多場區' : 'OHSMS單一場區';
  if (data.system === 'ISO 50001') return multi ? 'EnMS多場區(未改)' : 'EnMS單一場區';
  if (data.system === 'ISO 22000') return Number(data.sites) > 20 ? 'FSMS 20場區以上' : 'FSMS 20場區以內';
  if (data.system === 'IATF 16949') return 'IATF 16949';
  throw new Error('Unsupported management system.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = req.body || {};
    const files = unzipSync(new Uint8Array(Buffer.from(templateBase64, 'base64')));
    const sheetName = targetSheet(data);
    const days = data.auditDays || {};
    writeFields(files, '網站判定套表', [
      ['B2', data.system || '', false], ['B3', sheetName, false], ['B4', data.organization || '', false],
      ['B5', data.scope || '', false], ['B6', Math.max(1, Math.floor(Number(data.employees) || 1)), true],
      ['B7', Math.max(1, Math.floor(Number(data.sites) || 1)), true], ['B8', data.technicalCategories || '', false],
      ['B9', data.riskComplexity || '', false], ['B10', Number(days.initial) || 0, true],
      ['B11', Number(days.stage1) || 0, true], ['B12', Number(days.stage2) || 0, true],
      ['B13', Number(days.surveillance1) || 0, true], ['B14', Number(days.surveillance2) || 0, true],
      ['B15', Number(days.recertification) || 0, true], ['B16', data.basis || '', false],
      ['B17', 'V8.1.29', false], ['B18', new Date().toISOString(), false]
    ]);
    if (data.system === 'IATF 16949') {
      writeFields(files, sheetName, [
        ['B2', data.organization || '', false], ['B3', data.scope || '', false],
        ['B4', Math.max(1, Math.floor(Number(data.employees) || 1)), true],
        ['B5', ['IA', 'SA', 'RA'].includes(data.auditType) ? data.auditType : 'IA', false],
        ['B6', data.designResponsibility === 'Yes' ? 'Yes' : 'No', false],
        ['B7', Math.min(1, Math.max(0, Number(data.otherReduction) || 0)), true],
        ['B8', Math.max(0, Math.floor(Number(data.previousMinorNc) || 0)), true],
        ['B9', Math.min(1, Math.max(.5, Number(data.ncHours) || .5)), true],
        ['B10', Math.max(0, Number(data.otherAdditionalHours) || 0), true]
      ]);
    } else if (data.system === 'ISO 22000') {
      writeFields(files, sheetName, [['B2',data.organization||'',false],['B3',data.technicalCategories||'',false],['B5',data.scope||'',false],['I5',Math.max(1,Number(data.haccpStudies)||1),true],['I9',Math.max(1,Math.floor(Number(data.employees)||1)),true]]);
    } else if (Number(data.sites) <= 1) {
      writeFields(files, sheetName, [['B2',data.organization||'',false],['B3',data.technicalCategories||'',false],['B6',data.scope||'',false],['J2',Math.max(1,Math.floor(Number(data.employees)||1)),true]]);
    } else {
      writeFields(files, sheetName, [['B2',data.organization||'',false],['B3',data.technicalCategories||'',false],['B6',data.scope||'',false]]);
    }
    let workbook = strFromU8(files['xl/workbook.xml']);
    const calcPr = '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
    workbook = /<(?:\w+:)?calcPr\b/.test(workbook)
      ? workbook.replace(/<(?:\w+:)?calcPr\b[^>]*\/>/, calcPr)
      : workbook.replace('</x:workbook>', `${calcPr}</x:workbook>`);
    files['xl/workbook.xml'] = strToU8(workbook);
    const output = Buffer.from(zipSync(files, { level: 6 }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''UCS-D-053_R21.xlsx");
    return res.status(200).send(output);
  } catch (error) {
    console.error('R21 export failed', error);
    return res.status(500).json({ error: '無法產生 R21 驗證人天表，請稍後再試。' });
  }
}

