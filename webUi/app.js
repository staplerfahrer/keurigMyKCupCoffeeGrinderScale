if (app && app.exit) app.exit()

var app=(_=>{
	'use strict'
	var knobs = {
		stableGramsLimit           :       1,
		medianSampleCount          :      18,
		zeroCalibrationReading     :       0, /* not actually */
		highWeightCalibrationOffset: 348_491, /* offset above the actual zero point, usually around -230_000 */
		highWeightCalibrationWeight:   487.4,
		relayOnAboveG              :      19,
		relayDispenseG             :      12,
	}

	// JS convenience
	var m=Math,rnd=m.round,abs=m.abs,max=m.max,min=m.min,flr=m.floor,$doc=document,$=i=>$doc.querySelector(i)

	// Data I/O
	var reqXhr
	var reqRaw=_=>{reqXhr=new XMLHttpRequest();reqXhr.timeout=150;reqXhr.open('GET','/adcCount',!0);reqXhr.onreadystatechange=newData;reqXhr.send()}
	var reqRelay=mode=>{var ssr=new XMLHttpRequest();ssr.timeout=150;ssr.open('PUT','/switch/'+(mode?'on':'off'),!0);ssr.onreadystatechange=_=>false;ssr.send()}
	var reqLoadSettings=cb=>{var settingsXhr=new XMLHttpRequest();settingsXhr.timeout=3000;settingsXhr.open('GET','/settings',!0);settingsXhr.onreadystatechange=_=>cb(settingsXhr);settingsXhr.send()}
	var reqSaveSettings=_=>{var settingsXhr=new XMLHttpRequest();settingsXhr.timeout=3000;settingsXhr.open('POST','/settings',!0);settingsXhr.onreadystatechange=_=>false;settingsXhr.send(JSON.stringify(knobs))}
	var schUpd=_=>setTimeout(reqRaw, 1)

	var newData=_=>{
		if(reqXhr.readyState!==4)
			return
		var jsn
		if(''===(jsn=reqXhr.responseText))
			return schUpd()

		var raw=JSON.parse(jsn)['adcCount']
		meds.shift();meds.push(raw)
		var median=a=>{var s=a.toSorted((a,b)=>a-b);return s[flr(s.length/2)] || 0}
		var med=median(meds)

		filt=med*.5+filt*.5
		var wt = weight(filt)

		if (appState.isZero()) {
			if (!isStable(raw, filt))
				appState.toUnstable()
		} else if (appState.isUnstable()) {
			if (isStable(raw, filt)) {
				if (knobs.zeroCalibrationReading === 0 || (wt !== null && wt < knobs.stableGramsLimit)) {
					appState.toZero()
				} else {
					appState.toWeight()
					wtCt = filt - knobs.zeroCalibrationReading
				}
			}
		} else if (appState.isWeight()) {
			if (!isStable(raw, filt))
				appState.toUnstable()
		} else if (appState.isExit()) {
			return
		}
		if (appState.isZero()) calZero(filt, 0)
		if (appState.isWeight()) calZero(filt, wtCt)

		updateRelay(wt)
		updateUi(raw, filt, wt)
		schUpd()
	}

	// App state
	var state=0,STUNST=0,STZERO=1,STWGHT=2,STEXIT=3
	var relay=0,ROFF=0,RON=1
	var unstableTime1=Date.now(),unstableTime2=0
	var stateChange=s=>{
		if (state===s) debugger
		if(s===STUNST) {
			unstableTime1=Date.now()
		} else {
			unstableTime2=Number((Date.now()-unstableTime1)/1000/*ms*/).toFixed(1);
		}
		state=s
	}
	var appState = {
		toUnstable  : _=>stateChange(STUNST),
		toZero      : _=>stateChange(STZERO),
		toWeight    : _=>stateChange(STWGHT),
		toExit      : _=>stateChange(STEXIT),

		toRelayOn   : _=>{
			var change = relay === ROFF
			relay = RON
			return change
		},
		toRelayOff  : _=>{
			var change = relay === RON
			relay = ROFF
			return change
		},

		isUnstable  : _=>state===STUNST,
		isZero      : _=>state===STZERO,
		isWeight    : _=>state===STWGHT,
		isExit      : _=>state===STEXIT,

		unstableTime: _=>unstableTime2,
	}

	// Scale stability
	var stableCount=0
	var isStable=(noisy,clean)=>{
		stableCount = abs(noisy - clean) < ctPerGram() * knobs.stableGramsLimit
			? min(stableCount + 1, 100)
			: 0
		return stableCount > 10
	}

	var filt=0,wtCt=0
	var meds=[];meds.length=knobs.medianSampleCount

	var ctPerGram = _              => knobs.highWeightCalibrationOffset / knobs.highWeightCalibrationWeight
	var weight    = filt           => (filt - knobs.zeroCalibrationReading) / ctPerGram()
	var calZero   = (filt, offset) => knobs.zeroCalibrationReading = rnd(filt-offset)

	$('#btCalZero').onclick         = _=> appState.toZero()
	$('#btCalHighOffset').onclick   = _=>$('#inCalHighOffset').value = filt - knobs.zeroCalibrationReading
	$('#btCalHighOffset').innerText = `${knobs.highWeightCalibrationWeight} g offset`
	$('#inCalHighOffset').value     = knobs.highWeightCalibrationOffset
	$('#onAboveG').value            = knobs.relayOnAboveG
	$('#onAboveG').onchange         = e=>knobs.relayOnAboveG=+e.target.value
	$('#dispenseG').value           = knobs.relayDispenseG
	$('#dispenseG').onchange        = e=>knobs.relayDispenseG=+e.target.value
	$('#save').onclick              = reqSaveSettings

	// UI
	var chart=(_=>{
		var c = $('#chart')
		var norm=v=>v/(2**23)*500+500;
		var makeBar=(v,w,h,bl,br)=>{var d=$doc.createElement('div');d.style=`left:${v%1000/*px*/-w/2-bl}px;width:${w}px;height:${h}px;border:0 solid #ebb;border-width:0 ${br}px 0 ${bl}px;position:relative;background:${appState.isUnstable()?'#a10':'#112'}`;return d};
		var live=raw=>$('#live').replaceChildren(makeBar(norm(raw),20,10,0,0),makeBar(norm(raw)*10**2,20,10,0,0),makeBar(norm(raw)*10**4,20,10,0,0))
		var unstable=raw=>{var x=norm(raw)*10**4,bar=makeBar(x,20,1,x%1000-10,1000-x%1000-9);c.insertBefore(bar, c.firstChild)}
		var trace=(filt,raw)=>{
			if(appState.isUnstable())
				return unstable(raw)
			c.insertBefore(makeBar(norm(filt)*10**4,3,1,max(filt-raw,0),max(raw-filt,0)),c.firstChild);while(c.children.length>1000/*bars*/){c.removeChild(c.lastChild)}
		}
		return {
			live:  live,
			trace: trace,
		}
	})(appState)

	var updateUi=(raw, filt, wt)=>{
		chart.live(raw)
		chart.trace(filt, raw)
		var rptW=Number(rnd(wt/knobs.stableGramsLimit)*knobs.stableGramsLimit).toFixed(2).split('.')
		$('#status').innerText  = `ADC ${raw} | ${appState.isUnstable()?'UNSTABLE':appState.isZero()?'zero':'weight'} ${!appState.isUnstable()?' in '+appState.unstableTime()+' s':''}`
		$('#readout').innerHTML =`${rptW[0]}.<span style="color:#ccc">${rptW[1]}</span> g`
		$('#inCalZero').value   = knobs.zeroCalibrationReading
	}

	// Relay state switching
	var updateRelay=weight=>{
		var nowOn = false, stateChanged = false
		if (weight > knobs.relayOnAboveG) nowOn = true
		if (weight > knobs.relayOnAboveG + knobs.ssrDispenseG) nowOn = false

		stateChanged = nowOn ? appState.toRelayOn() : appState.toRelayOff()
		if (stateChanged) {
			reqRelay(nowOn)
		}
	}

	// Get started
	reqLoadSettings(settingsXhr=>{
		if (settingsXhr.readyState!==4) return
		knobs = JSON.parse(settingsXhr.responseText)
		schUpd()
	})

	return {
		'exit': _=>appState.toExit()
	}
})()
