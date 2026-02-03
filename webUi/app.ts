var app=(()=>{
	var model = {
		states: {
			Unstable  : 0,
			Zero      : 1,
			Weight    : 2,
			Dispensing: 3,
			Exit      : 4,
		},
		stableGramsLimit           :       1,
		medianSampleCount          :      18,
		zeroCalibrationReading     :       0, /* not actually */
		highWeightCalibrationOffset: 348_491,
		calibrationWeight          :   487.4,
		relayiAG                   :      19,
		relayiDG                   :      12,
		st                         :       0,
		raw                        :       0,
		filt                       :       0,
		wt                         :       0,
	}

	// JS convenience
	var M=Math,rnd=M.round,max=M.max,$d=document

	var stateChange = (to: number) => {
		if (model.st === model.states.Zero && to === model.states.Zero) {

		} else
		if (model.st === model.states.Zero && to === model.states.Unstable) {

		} else

		if (model.st === model.states.Unstable && to === model.states.Zero) {

		} else
		if (model.st === model.states.Unstable && to === model.states.Weight) {

		} else
		if (model.st === model.states.Unstable && to === model.states.Exit) {

		} else

		if (model.st === model.states.Weight && to === model.states.Zero) {

		} else
		if (model.st === model.states.Weight && to === model.states.Dispensing) {
			reqRelay(true)
		} else
		if (model.st === model.states.Weight && to === model.states.Exit) {

		} else

		if (model.st === model.states.Dispensing && to === model.states.Unstable) {
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Zero) {
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Weight) {
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Exit) {
			reqRelay(false)
		} else

		if (model.st === model.states.Zero && to === model.states.Exit) {

		} else
			debugger
	}

	// Data I/O
	var req = (timeout: number, method: string, url: string, data: any, cb: CallableFunction | null) => {
		var xhr = new XMLHttpRequest()
		xhr.timeout = timeout
		xhr.open(method, url, true)
		if (cb) xhr.onload = () => cb(xhr)
		xhr.send(data)
	}
	var reqRaw = (cb: CallableFunction) => req(150, 'GET', '/adcCount', null, cb)
	// var reqRaw = (cb: CallableFunction)=>{
	// 	var xhr=new X()
	// 	xhr.timeout=150
	// 	xhr.open('GET','/adcCount', true)
	// 	xhr.onload=()=>cb(xhr)
	// 	xhr.send()
	// }
	var reqRelay = (mode: boolean) => req(150, 'PUT', '/switch/'+(mode?'on':'off'), null, null)
	// var reqRelay = (mode: boolean)=>{
	// 	var xhr=new X()
	// 	xhr.timeout=150
	// 	xhr.open('PUT','/switch/'+(mode?'on':'off'), true)
	// 	//xhr.onload=()=>false
	// 	xhr.send()
	// }
	var reqLoadSettings = (cb: CallableFunction) => req(3000, 'GET', '/settings', null, cb)
	// var reqLoadSettings = (cb: CallableFunction)=>{
	// 	var xhr=new X()
	// 	xhr.timeout=3000
	// 	xhr.open('GET','/settings', true)
	// 	xhr.onload=()=>cb(xhr)
	// 	xhr.send()
	// }
	var reqSaveSettings = () => req(3000, 'POST', '/settings', JSON.stringify(model), null)
	// var reqSaveSettings = ()=>{
	// 	var xhr=new X()
	// 	xhr.timeout=3000
	// 	xhr.open('POST','/settings', true)
	// 	//xhr.onload=()=>false
	// 	xhr.send(JSON.stringify(model))
	// }

	var view = (m=>{
		var $  = (i: string) => $d.getElementById(i) as HTMLElement
		var $i = (i: string) => $d.getElementById(i) as HTMLInputElement

		$('bC0').onclick    = () => stateChange(m.states.Zero)
		$('bCHO').onclick   = () => $i('iCHO').value = ''+(filt - m.zeroCalibrationReading)
		$('bCHO').innerText = `${m.calibrationWeight} g offset`
		$i('iCHO').value    = ''+m.highWeightCalibrationOffset
		$i('iAG').value     = ''+m.relayiAG
		$i('iAG').onchange  = e => m.relayiAG = +(e.target as HTMLInputElement).value
		$i('iDG').value     = ''+m.relayiDG
		$i('iDG').onchange  = e => m.relayiDG = +(e.target as HTMLInputElement).value
		$('save').onclick   = reqSaveSettings

		var c        = $('chart')
		var norm     = (v: number) => v/(2**23)*500+500
		var makeBar  = (v: number, w:number, bl:number, br:number, col:string="")=>{
			var d=$d.createElement('div');
			d.style=`width:${w}px;left:${v%1000/*px*/-w/2-bl}px;border-width:0 ${br}px 0 ${bl}px;background:${col}'}`;
			return d
		}
		var live     = (raw: number) => $('live').replaceChildren(makeBar(norm(raw),20,0,0),makeBar(norm(raw)*10**2,20,0,0),makeBar(norm(raw)*10**4,20,0,0))
		var unstable = (raw: number) => {var x=norm(raw)*10**4,bar=makeBar(x,20,x%1000-10,1000-x%1000-9);c.insertBefore(bar, c.firstChild)}
		var trace    = (filt: number, raw: number, isUnstable: boolean) => {
			if (isUnstable) return unstable(raw)
			c.insertBefore(makeBar(norm(filt)*10**4,3,max(filt-raw,0),max(raw-filt,0)),c.firstChild);
			while(c.children.length>1000/*bars*/){c.lastChild !== null ? c.removeChild(c.lastChild) : false}
		}

		var updateUi=(raw: number, filt: number, isUnstable: boolean, stLabel: string, wt: number)=>{
			live(raw)
			trace(filt, raw, isUnstable)
			$('status').innerText  = `ADC ${raw} | ${stLabel}`
			$('readout').innerHTML =`${rnd(wt/m.stableGramsLimit)*m.stableGramsLimit} g`
			$i('iC0').value        = ''+m.zeroCalibrationReading
		}

		return {
			update: ()=>updateUi(m.raw, m.filt, m.st===m.states.Unstable, '[state label]', m.wt)
		}
	})(model)


	var newData=(x: XMLHttpRequest)=>{
		var ctPerGram = () => model.highWeightCalibrationOffset / model.calibrationWeight
		var weight = (filt: number) => (filt - model.zeroCalibrationReading) / ctPerGram()
		var calZero = (filt: number, offset: number) => model.zeroCalibrationReading = rnd(filt - offset)
		var isStable = (raw: number, filt: number) => {
			stableCount = M.abs(raw - filt) < ctPerGram() * model.stableGramsLimit
				? M.min(stableCount + 1, 100)
				: 0
			return stableCount > 10
		}


		var jsn
		if ( '' === (jsn=x.responseText))
			return setTimeout(()=>reqRaw(newData), 1)

		var raw=JSON.parse(jsn)['adcCount']
		meds.shift();meds.push(raw)
		var median=(a: number[])=>a.toSorted((a: number, b: number)=>a-b)[M.floor(a.length/2)] || 0
		var med=median(meds)

		filt=med*.5+filt*.5
		model.raw = raw
		model.filt = filt
		model.wt = weight(filt)


		if (model.st === model.states.Zero) {
			if (!isStable(raw, filt))
				stateChange(model.states.Unstable)
		} else
		if (model.st === model.states.Unstable) {
			if (isStable(raw, filt)) {
				if (model.zeroCalibrationReading === 0 || (model.wt !== null && model.wt < model.stableGramsLimit)) {
					stateChange(model.states.Zero)
				} else {
					stateChange(model.states.Weight)
					wtCt = filt - model.zeroCalibrationReading
				}
			}
		} else
		if (model.st === model.states.Weight) {
			if (!isStable(raw, filt))
				stateChange(model.states.Unstable)
			else
			if (model.wt > model.relayiAG && model.wt < model.relayiAG + model.relayiDG)
				stateChange(model.states.Dispensing)
		} else
		if (model.st === model.states.Dispensing) {
			if (model.wt > model.relayiAG + model.relayiDG)
				stateChange(model.states.Unstable)
		} else
		if (model.st === model.states.Exit)
			return

		// Zero tracking with or without weight
		if (model.st === model.states.Zero) calZero(filt, 0)
		if (model.st === model.states.Weight) calZero(filt, wtCt)

		view.update()
		setTimeout(()=>reqRaw(newData), 1)
	}

	// Scale stability
	var stableCount = 0

	var filt = 0, wtCt = 0
	var meds: number[] = []; meds.length = model.medianSampleCount

	function boot() {
		reqLoadSettings((settingsXhr: XMLHttpRequest) => {
			model = JSON.parse(settingsXhr.responseText)
			setTimeout(()=>reqRaw(newData), 1)
		})
	}

	return {
		'boot' : boot,
		'exit' : ()=>stateChange(model.states.Exit)
	}
})()

app.boot()