(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RiskEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const ORDER={
    'ISO 9001':{'有限':1,'低風險':2,'中風險':3,'高風險':4,'特殊個案':5},
    'ISO 14001':{'有限':1,'低風險':2,'中風險':3,'高風險':4,'特殊個案':5},
    'ISO 45001':{'有限':1,'低風險':2,'中風險':3,'高風險':4,'特殊個案':5},
    'ISO 50001':{'低':1,'中':2,'高':3},
    'IATF 16949':{'低':1,'中':2,'高':3}
  };
  function uniqueChoices(choices){
    return [...new Map((choices||[]).filter(Boolean).map(item=>[
      [item.nace||'',item.ea||'',item.technical_class||'',item.risk||''].join('|'),item
    ])).values()];
  }
  function selectHighest(choices,system){
    const unique=uniqueChoices(choices),ranks=ORDER[system]||{};
    if(!unique.length)return null;
    const selected=unique.reduce((highest,item)=>(ranks[item.risk]||0)>(ranks[highest.risk]||0)?item:highest);
    return {selected,choices:unique,rule:'所有最終保留活動範圍逐一查風險參照表，先採最高等級，再進入人天查表。'};
  }
  function metalReferenceClass(nace,system){
    const code=String(nace||'');
    if(!/^(24|25)\./.test(code))return '';
    if(system==='ISO 9001')return '17';
    const primary=/^24\.(10|20|4\d|5\d)$/.test(code);
    const surface=/^25\.61$/.test(code);
    const forming=/^24\.3\d$/.test(code)||/^25\.(11|12|21|29|50)$/.test(code);
    if(system==='ISO 14001')return primary?'17-1':surface?'17-2':'17-3';
    if(system==='ISO 45001')return primary?'17-1':surface?'17-2':forming?'17-3(a)':'17-3(b)';
    return '';
  }
  function technicalReferenceClass(nace,ea,system){
    return riskReferenceClass(nace,ea,system,'');
  }
  function nonMetalReferenceClass(nace,ea,system){
    const code=String(nace||''),formalEa=String(ea||'');
    if(formalEa!=='15'||!/^23\./.test(code))return '';
    if(system==='ISO 9001')return '15';
    if(!['ISO 14001','ISO 45001'].includes(system))return '';
    // Risk sheet split: ceramic/refractory/abrasive processing is 15-1;
    // glass, clay, lime/stone and the remaining non-metal products are 15-2.
    return /^23\.(2|4|9)/.test(code)?'15-1':'15-2';
  }
  function serviceRiskReferenceClass(nace,system){
    const code=String(nace||'');
    // NACE 81 facilities/cleaning and NACE 82 business-support services use
    // risk-sheet class 35-1. Their certification EA/NACE stays unchanged.
    if(/^(81|82)\./.test(code)&&['ISO 9001','ISO 14001','ISO 45001'].includes(system))return '35-1';
    // Head-office/enterprise management is explicitly class 35-2 in EMS/OHSMS.
    if(/^70\.(10|22)$/.test(code))return system==='ISO 9001'?'35-1':'35-2';
    return '';
  }
  function tradeRiskReferenceClass(nace,system){
    if(!/^(45|46|47)\./.test(String(nace||'')))return '';
    if(system==='ISO 9001')return '29';
    if(['ISO 14001','ISO 45001'].includes(system))return '29-2';
    return '';
  }
  function transportRiskReferenceClass(nace,ea,system,context){
    const code=String(nace||''),formalEa=String(ea||''),text=String(context||'');
    if(formalEa!=='31'||!/^(49|50|51|52|53|61)\./.test(code))return '';
    // Certification stays EA31. The independent risk workbook subdivides the
    // same activity for audit-day lookup; these values must never be written
    // back to the technical classification.
    if(system==='ISO 9001')return '31-2';
    const hazardous=/(?:危險物品|危險貨物|危險品|大量有害物質|大量有害|爆炸物|易燃物)/.test(text);
    const management=/(?:管理|調度|協調|路線安排|派車|運輸支援)/.test(text);
    if(system==='ISO 14001')return hazardous?'31-3':management?'31-2':'31-1';
    if(system==='ISO 45001')return hazardous?'31-1':management?'31-3':'31-2';
    return '';
  }
  function riskReferenceClass(nace,ea,system,context){
    // This bridge belongs exclusively to the risk workbook.  In particular it
    // must never accept the certification technical category as a fallback:
    // identical-looking codes in the two workbooks are independent data.
    return tradeRiskReferenceClass(nace,system)||transportRiskReferenceClass(nace,ea,system,context)||serviceRiskReferenceClass(nace,system)||metalReferenceClass(nace,system)||nonMetalReferenceClass(nace,ea,system)||String(ea||'').trim();
  }
  return {ORDER,uniqueChoices,selectHighest,metalReferenceClass,nonMetalReferenceClass,technicalReferenceClass,serviceRiskReferenceClass,tradeRiskReferenceClass,transportRiskReferenceClass,riskReferenceClass};
});

