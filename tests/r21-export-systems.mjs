import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import handler from '../api/export-r21.mjs';

const cases=[
  ['ISO 9001',1,'QMS單一場區'],['ISO 14001',2,'EMS多場區'],['ISO 45001',1,'OHSMS單一場區'],
  ['ISO 50001',2,'EnMS多場區(未改)'],['ISO 22000',21,'FSMS 20場區以上'],['IATF 16949',1,'IATF 16949']
];
for(const [system,sites,target] of cases){
  let bytes;
  const req={method:'POST',body:{system,organization:'測試公司',scope:'測試驗證範圍',employees:88,sites,technicalCategories:system==='ISO 22000'?'CIII、CIV':'測試類別',riskComplexity:'高風險／高複雜度',basis:'測試公式依據',haccpStudies:2,auditDays:{initial:4,stage1:1.5,stage2:2.5,surveillance1:1.5,surveillance2:1.5,recertification:3},auditType:'IA',designResponsibility:'No'}};
  const res={status(code){this.statusCode=code;return this},setHeader(){},json(body){throw new Error(JSON.stringify(body))},send(body){bytes=body;return body}};
  await handler(req,res);assert.equal(res.statusCode,200,`${system} export status`);assert.ok(bytes.length>600000,`${system} workbook size`);
  const files=unzipSync(new Uint8Array(bytes)),workbook=strFromU8(files['xl/workbook.xml']);
  assert.match(workbook,/網站判定套表/);assert.match(workbook,new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(workbook,/fullCalcOnLoad="1"/);
  if(system==='ISO 22000')fs.writeFileSync('../../outputs/01a056bd-dc04-71b3-a1af-f5b196b437d9/R21-FSMS-populated-test.xlsx',bytes);
}
console.log('R21 exports passed for QMS, EMS, OHSMS, EnMS, FSMS, and IATF.');

