var app=(() => {
	var model = {
		states: {
			Unstable  : 0,
			Zero      : 1,
			Weight    : 2,
			Dispensing: 3,
			Exit      : 4,
			name      : [
				"Unstable",
				"Zero",
				"Weight",
				"Dispensing",
				"Exit"
			]
		},
		stableGramsLimit           :       1,
		medianSampleCount          :      18,
		zeroCalibrationReading     :       0,
		highWeightCalibrationOffset: 348_491,
		calibrationWeight          :   487.4,
		relayiAG                   :      19,
		relayiDG                   :      12,
		st                         :       0,
		raw                        :       0,
		meds                       :     [0],
		filt                       :       0,
		stableCount                :       0,
		wt                         :       0,
		offset                     :       0,
	}

	// JS convenience
	var M = Math, rnd = M.round, max = M.max, $d = document
	var $  = (i: string) => $d.getElementById(i) as HTMLElement
	var $i = (i: string) => $d.getElementById(i) as HTMLInputElement

	var stateChange = (to: number) => {
		console.log(model.states.name[to])
		if (model.st === model.states.Zero && to === model.states.Zero) {
			model.st = to
		} else
		if (model.st === model.states.Zero && to === model.states.Unstable) {
			model.st = to
		} else
		if (model.st === model.states.Zero && to === model.states.Exit) {
			model.st = to
		} else

		if (model.st === model.states.Unstable && to === model.states.Zero) {
			model.st = to
		} else
		if (model.st === model.states.Unstable && to === model.states.Weight) {
			model.st = to
		} else
		if (model.st === model.states.Unstable && to === model.states.Exit) {
			model.st = to
		} else

		if (model.st === model.states.Weight && to === model.states.Zero) {
			model.st = to
		} else
		if (model.st === model.states.Weight && to === model.states.Dispensing) {
			model.st = to
			reqRelay(true)
		} else
		if (model.st === model.states.Weight && to === model.states.Exit) {
			model.st = to
		} else

		if (model.st === model.states.Dispensing && to === model.states.Unstable) {
			model.st = to
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Zero) {
			model.st = to
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Weight) {
			model.st = to
			reqRelay(false)
		} else
		if (model.st === model.states.Dispensing && to === model.states.Exit) {
			model.st = to
			reqRelay(false)
		} else
			debugger
	}

	// Data I/O
	var req = (timeout: number, method: string, url: string, data: any, cb: CallableFunction | null) => {
		var x = new XMLHttpRequest()
		x.timeout = timeout
		x.open(method, url, true)
		if (cb) x.onload = () => cb(x)
		x.onerror = () => req(timeout, method, url, data, cb)
		x.send(data)
	}
	var reqRaw = (cb: CallableFunction) => req(3000, 'GET', '/adcCount', null, cb)
	var reqRelay = (mode: boolean) => req(3000, 'PUT', '/switch/'+(mode?'on':'off'), null, null)
	var reqLoadSettings = (cb: CallableFunction) => req(3000, 'GET', '/settings', null, cb)
	var reqSaveSettings = () => req(3000, 'POST', '/settings', JSON.stringify(model), null)

	// View
	$('bC0').onclick   = () => stateChange(model.states.Zero)
	$('bCHO').onclick  = () => $i('iCHO').value = '' + (model.filt - model.zeroCalibrationReading) // ????
	$i('iAG').onchange = e => model.relayiAG = +(e.target as HTMLInputElement).value
	$i('iDG').onchange = e => model.relayiDG = +(e.target as HTMLInputElement).value
	$('save').onclick  = reqSaveSettings

	var updateUi = () => {
		var c        = $('chart')
		var norm     = (v: number) => v / (2 ** 23) * 500 + 500
		var makeBar  = (v: number, w: number, bl: number, br: number, col: string) => {
			var d = $d.createElement('div')
			d.style = `width:${w}px;left:${v % 1000/*px*/ - w / 2 - bl}px;border-width:0 ${br}px 0 ${bl}px;background:${col};}`
			return d
		}
		var color    = model.st === model.states.Unstable ? '#f41' : '#014'
		var live     = (raw: number, color: string) => $('live').replaceChildren(makeBar(norm(raw), 20, 0, 0, color), makeBar(norm(raw) * 10**2, 20, 0, 0, color), makeBar(norm(raw) * 10**4, 20, 0, 0, color))
		var trace    = (filt: number, raw: number, isUnstable: boolean, color: string) => {
			var x = norm(raw) * 10**4, bar
			if (isUnstable)
				bar = makeBar(x, 20, x % 1000 - 10, 1000 - x % 1000 - 9, color)
			else
				bar = makeBar(norm(filt) * 10**4, 3, max(filt - raw, 0), max(raw - filt, 0), color)

			c.insertBefore(bar, c.firstChild)
			if (c.children.length > 1000/*bars*/ && c.lastChild) {
				c.removeChild(c.lastChild)
			}
		}
		live(model.raw, color)
		trace(model.filt, model.raw, model.st === model.states.Unstable, color)
		$('status').innerText  = `${model.states.name[model.st]}, ADC ${model.raw}\n${model.meds.toSorted((a, b) => a - b).join(',')}`
		$('readout').innerHTML = `${rnd(model.wt / model.stableGramsLimit) * model.stableGramsLimit} g`
		$('bCHO').innerText    = `${model.calibrationWeight} g offset`
		$i('iC0').value        = '' + model.zeroCalibrationReading
		$i('iCHO').value       = '' + model.highWeightCalibrationOffset
		$i('iAG').value        = '' + model.relayiAG
		$i('iDG').value        = '' + model.relayiDG
	}

	var newData = (x: XMLHttpRequest) => {
		var ctPerGram = () => model.highWeightCalibrationOffset / model.calibrationWeight
		var weight    = (filt: number) => (filt - model.zeroCalibrationReading) / ctPerGram()
		var calZero   = (filt: number, offset: number) => model.zeroCalibrationReading = rnd(filt - offset)
		var median    = (a: number[]) => a.toSorted((a, b) => a - b)[M.floor(a.length / 2)] || 0
		var isStable  = (raw: number, filt: number) => {
			model.stableCount = M.abs(raw - filt) < ctPerGram() * model.stableGramsLimit
				? M.min(model.stableCount + 1, 100)
				: 0
			return model.stableCount > 10
		}


		model.raw  = JSON.parse(x.responseText)['adcCount']
		model.meds.shift()
		model.meds.push(model.raw)
		model.filt = median(model.meds) * 0.3 + model.filt * 0.7
		model.wt   = weight(model.filt)


		if (model.st === model.states.Zero) {
			if (!isStable(model.raw, model.filt))
				stateChange(model.states.Unstable)
		} else
		if (model.st === model.states.Unstable) {
			if (isStable(model.raw, model.filt)) {
				if (model.zeroCalibrationReading === 0 || (model.wt !== null && model.wt < model.stableGramsLimit)) {
					stateChange(model.states.Zero)
				} else {
					stateChange(model.states.Weight)
					model.offset = model.filt - model.zeroCalibrationReading
				}
			}
		} else
		if (model.st === model.states.Weight) {
			if (!isStable(model.raw, model.filt))
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

		// Zero tracking without or with weight
		if (model.st === model.states.Zero)   calZero(model.filt, 0)
		if (model.st === model.states.Weight) calZero(model.filt, model.offset)

		updateUi()
		setTimeout(() => reqRaw(newData), 1)
	}

	function boot() {
		reqLoadSettings((settingsXhr: XMLHttpRequest) => {
			model = JSON.parse(settingsXhr.responseText)
			model.meds.length = model.medianSampleCount
			updateUi()
			setTimeout(() => reqRaw(newData), 1)
		})
	}

	return {
		'boot' : boot,
		'exit' : () => stateChange(model.states.Exit)
	}
})()

app.boot()