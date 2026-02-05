var app=(() => {
	// model ///////////////////////////////////////////////////////////////////
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
		'fl':       0, /* filtered reading */
		'sn':       0, /* stable number: counter to determine stability */
		'wG':       0, /* weight in grams */
		'wO':       0, /* weight offset, reading relative to 0 point */
	}
	var states = {
		Unknown   : 0,
		Unstable  : 1,
		Zero      : 2,
		Weight    : 3,
		Dispensing: 4,
	}
	var names = [
		'Unknown',
		'Unstable',
		'Zero',
		'Weight',
		'Dispensing',
	]
	var symbols = [
		'',
		'&#x2248;',
		'&#x25ef;',
		'&#x2b1c;',
		'&#x2234;',
	]

	var messages = {
		exit: false,
		bC0: false,
		bCH: false,
		iAG: false,
		iDG: false,
		bSv: false,
		adcCount: [] as number[],
		stateChange: 0,
	}
	var cycleInterval = 0, medians = [] as number[], stableWeight = false

	// Maths & convenience
	var M = Math, rnd = M.round, max = M.max, $d = document
	var $  = (i: string) => $d.getElementById(i) as HTMLElement
	var $i = (i: string) => $d.getElementById(i) as HTMLInputElement
	var median    = (a: number[]) => a.toSorted((a, b) => a - b)[M.floor(a.length / 2)] || 0
	var weight    = (filt: number) => (filt - model.c0) / ctPerGram()
	var ctPerGram = () => model.hO / model.hG
	var trackZero = (offset: number) => model.c0 = rnd(offset)
	var isStable  = (raw: number, filt: number) => {
		model.sn = M.abs(raw - filt) < ctPerGram() * model.sG
			? model.sn + 1
			: 0
		return model.sn > 9
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


	// View ////////////////////////////////////////////////////////////////////
	$('bC0').onclick   = () => messages.bC0 = true
	$('bCH').onclick   = () => messages.bCH = true
	$i('iAG').onchange = () => messages.iAG = true
	$i('iDG').onchange = () => messages.iDG = true
	$('bSv').onclick   = () => messages.bSv = true

	var updateUi = () => {
		var c        = $('chart')
		var norm     = (v: number) => v / (2 ** 23) * 500 + 500
		var makeBar  = (v: number, w: number, bl: number, br: number, col: string) => {
			var d = $d.createElement('div')
			d.style = `width:${w}px;left:${v % 1000/*px*/ - w / 2 - bl}px;border-width:0 ${br}px 0 ${bl}px;background:${col};}`
			return d
		}
		var makeLabel = (s: string) => {
			var d = $d.createElement('div')
			d.style = 'height:1em'
			d.innerText = s
			return d
		}
		var color    = model.st === states.Unstable ? '#f41' : '#014'
		var live     = () => {
			var n: Node[] = []
			medians.toSorted((a, b) => a - b).forEach(m => n.push(makeBar(norm(m) * 10**4, 5, 0, 0, color)))
			$('live').replaceChildren(...n)
		}
		var trace    = () => {
			var x = norm(model.rw) * 10**4, bar
			if (model.st === states.Unstable)
				bar = makeBar(x, 20, x % 1000 - 10, 1000 - x % 1000 - 9, color)
			else
				bar = makeBar(norm(model.fl) * 10**4, 3, max(model.fl - model.rw, 0), max(model.rw - model.fl, 0), color)

			if (messages.stateChange)
				c.insertBefore(makeLabel(names[messages.stateChange]), c.firstChild)

			c.insertBefore(bar, c.firstChild)

			if (c.children.length > 1000/*bars*/ && c.lastChild)
				c.removeChild(c.lastChild)
		}
		live()
		trace()
		$('readout').innerHTML = `${symbols[model.st]} ${rnd(model.wG / model.sG) * model.sG} g`
		$('status').innerText  = `${names[model.st]}, ADC ${model.rw}`
		$('bCH').innerText     = `${model.hG} g offset`
		$i('iC0').value        = '' + model.c0
		$i('iCH').value        = '' + model.hO
		$i('iAG').value        = '' + model.AG
		$i('iDG').value        = '' + model.DG
	}


	function adcCount(x: XMLHttpRequest) {
		messages.adcCount.push(JSON.parse(x.responseText)['adcCount'])
		setTimeout(() => reqRaw(adcCount), 1)
	}


	function cycle() {
		var oldState = model.st, newState: number|null = null

		while (messages.adcCount.length) {
			model.rw     = messages.adcCount.shift() as number
			medians.shift(); medians.push(model.rw)
			model.fl     = median(medians) * 0.3 + model.fl * 0.7
			model.wG     = weight(model.fl)
			stableWeight = isStable(model.rw, model.fl)
		}

		// pick next state /////////////////////////////////////////////////////
		switch (oldState) {
			case states.Unknown:
				// -> states.Unstable
				newState = states.Unstable
				break
			case states.Unstable:
				// -> states.Zero, states.Weight
				if (messages.bC0)
					newState = states.Zero
				else
				if (stableWeight) {
					if (model.c0 === 0 || (model.wG !== null && model.wG < model.sG)) {
						newState = states.Zero
					} else {
						newState = states.Weight
					}
				}
				break
			case states.Zero:
				// -> states.Unstable
				if (!stableWeight)
					newState = states.Unstable
				break
			case states.Weight:
				// -> states.Zero, states.Unstable, states.Dispensing
				if (messages.bC0)
					newState = states.Zero
				else
				if (!stableWeight)
					newState = states.Unstable
				else
				if (model.wG > model.AG && model.wG < model.AG + model.DG)
					newState = states.Dispensing
				break
			case states.Dispensing:
				// -> states.Zero, states.Unstable
				if (messages.bC0)
					newState = states.Zero
				else
				if (model.wG < model.AG)
					newState = states.Unstable
				else
				if (model.wG > model.AG + model.DG)
					newState = states.Unstable
				break
		}

		// act on state change /////////////////////////////////////////////////
		if (newState) {
			messages.stateChange = newState
			if (oldState === states.Unknown) {
				// Unknown -> Unstable
				setTimeout(() => reqRaw(adcCount), 1)
				reqLoadSettings((settingsXhr: XMLHttpRequest) => {
					var dlModel = JSON.parse(settingsXhr.responseText)

					if (!(Object.keys(dlModel).length === Object.keys(model).length &&
					Object.keys(dlModel).every(k => Object.prototype.hasOwnProperty.call(model, k))))
					// keys differ, save the correct model
					messages.bSv = true
					else
						// adopt downloaded model
					model = dlModel

					medians.length = model.nM
				})
			}
			else
			if (newState === states.Dispensing)
				// ... -> Dispensing
				reqRelay(true)
			else
			if (oldState === states.Dispensing)
				// Dispensing -> ...
				reqRelay(false)
			else
			if (newState === states.Weight)
				// ... -> Weight
				// remember weight offset for drift tracking later
				model.wO = model.fl - model.c0
			console.log(names[newState])
			model.st = newState
		}

		// act on messages /////////////////////////////////////////////////////
		if (messages.exit) {
			reqRelay(false)
			clearInterval(cycleInterval)
			return
		}
		if (messages.bC0) {
		}
		if (messages.bCH) {
			model.hO = model.fl - model.c0
		}
		if (messages.iAG) {
			model.AG = +$i('iAG').value
		}
		if (messages.iDG) {
			model.DG = +$i('iDG').value
		}
		if (messages.bSv) {
			reqSaveSettings()
		}

		// act on state ////////////////////////////////////////////////////////
		switch (model.st) {
			case states.Unstable:
				break
			case states.Zero:
				trackZero(model.fl)
				break
			case states.Weight:
				// subtract weight & track zero
				trackZero(model.fl - model.wO)
				break
			case states.Dispensing:
				break
		}

		// update UI, clear messages ///////////////////////////////////////////
		updateUi()
		messages.bC0 = false
		messages.bCH = false
		messages.iAG = false
		messages.iDG = false
		messages.bSv = false
		messages.stateChange = 0
	}

	console.log(names[model.st])
	cycleInterval = setInterval(cycle, 50)

	return {
		'exit' : () => messages.exit = true
	}
})()
