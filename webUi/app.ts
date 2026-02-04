var app=(() => {
	var model = {
		'sG':       1, /* grams stability limit */
		'nM':      18, /* size of median sample set */
		'c0':       0, /* 0 g ADC reading */
		'hO': 348_491, /* relative calibration points above 0 g reading */
		'hG':   487.4, /* calibration weight in grams */
		'AG':      19, /* relay activation lower limit grams */
		'DG':      12, /* dispense grams */
		'st':       0, /* current state */
		'rw':       0, /* raw reading */
		'md':     [0], /* sample set for taking the median */
		'fl':       0, /* filtered reading */
		'sc':       0, /* counter to determine stability */
		'wt':       0, /* weight in grams */
		'of':       0, /* weight reading relative to 0 point */
	}

	// JS convenience
	var M = Math, rnd = M.round, max = M.max, $d = document
	var $  = (i: string) => $d.getElementById(i) as HTMLElement
	var $i = (i: string) => $d.getElementById(i) as HTMLInputElement

	var states = {
		Unstable  : 0,
		Zero      : 1,
		Weight    : 2,
		Dispensing: 3,
		Exit      : 4,
	}
	var names = [
		"Unstable",
		"Zero",
		"Weight",
		"Dispensing",
		"Exit"
	]
	var symbols = [
		"&#x2248;",
		"&#x25ef;",
		"&#x2b1c;",
		"&#x2234;",
		""
	]

	var stateChange = (to: number) => {
		console.log(names[to])
		if (model.st === states.Zero &&
				[states.Zero, states.Unstable, states.Exit].indexOf(to) > -1) {
			model.st = to
		} else
		if (model.st === states.Unstable &&
				[states.Zero, states.Weight, states.Exit].indexOf(to) > -1) {
			model.st = to
		} else
		if (model.st === states.Weight &&
				[states.Unstable, states.Zero, states.Dispensing, states.Exit].indexOf(to) > -1) {
			model.st = to
			if (to === states.Dispensing)
				reqRelay(true)
		} else
		if (model.st === states.Dispensing &&
				[states.Unstable, states.Zero, states.Weight, states.Exit].indexOf(to) > -1) {
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
		x.ontimeout = x.onabort = x.onerror = () => req(timeout, method, url, data, cb)
		x.send(data)
	}
	var reqRaw = (cb: CallableFunction) => req(3000, 'GET', '/adcCount', null, cb)
	var reqRelay = (mode: boolean) => req(3000, 'PUT', '/switch/'+(mode?'on':'off'), null, null)
	var reqLoadSettings = (cb: CallableFunction) => req(3000, 'GET', '/settings', null, cb)
	var reqSaveSettings = () => req(3000, 'POST', '/settings', JSON.stringify(model), null)

	// View
	$('bC0').onclick   = () => stateChange(states.Zero)
	$('bCHO').onclick  = () => $i('iCHO').value = '' + (model.fl - model.c0) // ????
	$i('iAG').onchange = e => model.AG = +(e.target as HTMLInputElement).value
	$i('iDG').onchange = e => model.DG = +(e.target as HTMLInputElement).value
	$('save').onclick  = reqSaveSettings

	var updateUi = () => {
		var c        = $('chart')
		var norm     = (v: number) => v / (2 ** 23) * 500 + 500
		var makeBar  = (v: number, w: number, bl: number, br: number, col: string) => {
			var d = $d.createElement('div')
			d.style = `width:${w}px;left:${v % 1000/*px*/ - w / 2 - bl}px;border-width:0 ${br}px 0 ${bl}px;background:${col};}`
			return d
		}
		var color    = model.st === states.Unstable ? '#f41' : '#014'
		var live     = () => {
			var n: Node[] = []
			model.md.toSorted((a, b) => a - b).forEach(m => n.push(makeBar(norm(m) * 10**4, 5, 0, 0, color)))
			$('live').replaceChildren(...n)
		}
		var trace    = () => {
			var x = norm(model.rw) * 10**4, bar
			if (model.st === states.Unstable)
				bar = makeBar(x, 20, x % 1000 - 10, 1000 - x % 1000 - 9, color)
			else
				bar = makeBar(norm(model.fl) * 10**4, 3, max(model.fl - model.rw, 0), max(model.rw - model.fl, 0), color)

			c.insertBefore(bar, c.firstChild)
			if (c.children.length > 1000/*bars*/ && c.lastChild)
				c.removeChild(c.lastChild)
		}
		live()
		trace()
		$('readout').innerHTML = `${symbols[model.st]} ${rnd(model.wt / model.sG) * model.sG} g`
		$('status').innerText  = `${names[model.st]}, ADC ${model.rw}`
		$('bCHO').innerText    = `${model.hG} g offset`
		$i('iC0').value        = '' + model.c0
		$i('iCHO').value       = '' + model.hO
		$i('iAG').value        = '' + model.AG
		$i('iDG').value        = '' + model.DG
	}

	var newData = (x: XMLHttpRequest) => {
		var ctPerGram = () => model.hO / model.hG
		var weight    = (filt: number) => (filt - model.c0) / ctPerGram()
		var calZero   = (filt: number, offset: number) => model.c0 = rnd(filt - offset)
		var median    = (a: number[]) => a.toSorted((a, b) => a - b)[M.floor(a.length / 2)] || 0
		var isStable  = (raw: number, filt: number) => {
			model.sc = M.abs(raw - filt) < ctPerGram() * model.sG
				? M.min(model.sc + 1, 100)
				: 0
			return model.sc > 10
		}


		model.rw = JSON.parse(x.responseText)['adcCount']
		model.md.shift()
		model.md.push(model.rw)
		model.fl = median(model.md) * 0.3 + model.fl * 0.7
		model.wt = weight(model.fl)


		if (model.st === states.Zero) {
			if (!isStable(model.rw, model.fl))
				stateChange(states.Unstable)
		} else
		if (model.st === states.Unstable) {
			if (isStable(model.rw, model.fl)) {
				if (model.c0 === 0 || (model.wt !== null && model.wt < model.sG)) {
					stateChange(states.Zero)
				} else {
					stateChange(states.Weight)
					model.of = model.fl - model.c0
				}
			}
		} else
		if (model.st === states.Weight) {
			if (!isStable(model.rw, model.fl))
				stateChange(states.Unstable)
			else
			if (model.wt > model.AG && model.wt < model.AG + model.DG)
				stateChange(states.Dispensing)
		} else
		if (model.st === states.Dispensing) {
			if (model.wt > model.AG + model.DG)
				stateChange(states.Unstable)
			if (model.wt < model.AG)
				stateChange(states.Unstable)
		} else
		if (model.st === states.Exit)
			return

		// Zero tracking without or with weight
		if (model.st === states.Zero)   calZero(model.fl, 0)
		if (model.st === states.Weight) calZero(model.fl, model.of)

		updateUi()
		setTimeout(() => reqRaw(newData), 1)
	}

	reqLoadSettings((settingsXhr: XMLHttpRequest) => {
		var model2 = JSON.parse(settingsXhr.responseText)
		// Save new model if different keys
		if (!(Object.keys(model2).length === Object.keys(model).length &&
				Object.keys(model2).every(k => Object.prototype.hasOwnProperty.call(model, k))))
			reqSaveSettings()
		else
			model = model2

		model.md.length = model.nM
		updateUi()
		setTimeout(() => reqRaw(newData), 1)
	})

	return {
		'exit' : () => stateChange(states.Exit)
	}
})()
