document.addEventListener("DOMContentLoaded", () => {
    const puntos = [];
    const map = L.map('map').setView([0, 0], 2);
    let poligonal = L.polygon([], { color: '#ff0000', fillColor: '#00ff00', fillOpacity: 0.5, weight: 2 }).addTo(map);
    const tableBody = document.getElementById('tableBody');
    const rangoPendientesTableBody = document.getElementById('rangoPendientesTableBody');
    const rangoPendientesHeader = document.getElementById('rangoPendientesHeader');

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    async function obtenerElevacion(lat, lon) {
        const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations: [{ latitude: lat, longitude: lon }] })
        });
        const data = await response.json();
        return data.results[0]?.elevation || 0;
    }

    map.on('click', async function (e) {
        const lat = parseFloat(e.latlng.lat);
        const lon = parseFloat(e.latlng.lng);
        const elevacion = await obtenerElevacion(lat, lon);
        agregarPuntoAGrid(lat, lon, elevacion);
    });

    function agregarPuntoAGrid(lat, lon, elev) {
        const nuevoPunto = [lat, lon, elev];
        puntos.push(nuevoPunto);
        actualizarTabla();
        actualizarPoligonal(); // <-- Llama a esta función para actualizar la poligonal
        generarTablaDePendientes();
        generarArrayPendientes();
    }

    function actualizarTabla() {
        tableBody.innerHTML = '';
        puntos.forEach((punto, index) => {
            // La posición 3 del array (punto[3]) indica el origen: 'map' o 'button'
            const detalle = (punto[3] === 'map') 
                ? 'Punto de dibujo de la poligonal'
                : (punto[3] === 'button' 
                    ? 'Control de alturas para determinar riesgo o movimiento de tierras' 
                    : 'Punto de dibujo de la poligonal');
                    
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td>${index}</td>
                <td>${punto[0].toFixed(6)}</td>
                <td>${punto[1].toFixed(6)}</td>
                <td>${punto[2].toFixed(2)}</td>
                <td>${detalle}</td>
            `;
            tableBody.appendChild(newRow);
        });
    }

    function actualizarPoligonal() {
        const coords = puntos.map(p => [p[0], p[1]]);
        if (coords.length >= 3) {
            // Se cierra la poligonal volviendo al punto inicial
            poligonal.setLatLngs([...coords, coords[0]]);
            poligonal.setStyle({
                color: document.getElementById('lineColor').value,
                fillColor: document.getElementById('fillColor').value,
                fillOpacity: 0.5,
                weight: document.getElementById('lineWidth').value
            });
        } else {
            // Si hay menos de 3 puntos, no se dibuja la poligonal
            poligonal.setLatLngs([]);
        }
    }

    async function generarPuntosEnCuadradoConAlturas() {
        if (puntos.length < 3) {
            alert("Se requieren al menos 3 puntos para generar puntos distribuidos.");
            return;
        }
        
        const numPuntosPorLado = parseInt(prompt("Ingrese cuántos puntos desea por lado del cuadrado:", "10"));
        if (isNaN(numPuntosPorLado) || numPuntosPorLado <= 0) {
            alert("Por favor, ingrese un número válido mayor a 0.");
            return;
        }
        
        // Obtener límites a partir de los puntos de control actuales
        const bounds = L.latLngBounds(puntos.map(p => [p[0], p[1]]));
        const minLat = bounds.getSouth();
        const maxLat = bounds.getNorth();
        const minLon = bounds.getWest();
        const maxLon = bounds.getEast();
        const boundsArray = [minLat, maxLat, minLon, maxLon];
        
        const elevaciones = [];
        const stepLat = (maxLat - minLat) / (numPuntosPorLado - 1);
        const stepLon = (maxLon - minLon) / (numPuntosPorLado - 1);
        
        // Generar puntos distribuidos con alturas
        for (let i = 0; i < numPuntosPorLado; i++) {
            for (let j = 0; j < numPuntosPorLado; j++) {
                const lat = minLat + i * stepLat;
                const lon = minLon + j * stepLon;
                const elevacion = await obtenerElevacion(lat, lon);
                elevaciones.push({ lat, lon, elevacion });
                
                // Opcional: Dibujar cada punto en el mapa con un círculo
                L.circle([lat, lon], { radius: 0, color: 'red' })
                    .addTo(map)
                    .bindPopup(`Elevación: ${elevacion.toFixed(2)} m`)
                    .openPopup();
            }
        }
        
        // Dibujar el rectángulo delimitador del cuadrilátero
        const square = L.rectangle([[minLat, minLon], [maxLat, maxLon]], { color: 'blue', weight: 2 });
        square.addTo(map);
        
        // Mostrar los resultados en el div de elevaciones (y actualizar demás vistas)
        mostrarResultadosElevaciones(elevaciones);
        generarTablaDePendientes();
        generarArrayPendientes();
        
        // Calcular el mínimo de elevaciones de los puntos generados
        const minElev = Math.min(...elevaciones.map(p => p.elevacion));
        
        // Generar el array de pendientes a partir de elevaciones
        const pendientesArray = elevaciones.map(p => ({
             lat: p.lat,
             lon: p.lon,
             pendiente: parseFloat(((p.elevacion - minElev) / 100).toFixed(2))
        }));
        
        // Debug: Mostrar en consola los arrays generados
        console.log("Elevaciones Array:", elevaciones);
        console.log("Pendientes Array:", pendientesArray);
        
        // Llamar automáticamente a la función que genera las gráficas de contornos
        plotContourGraphs(elevaciones, pendientesArray, boundsArray);
    }

    function mostrarResultadosElevaciones(elevaciones) {
        let resultados = 'Resultados:\n';
        elevaciones.forEach((punto, index) => {
            resultados += `Punto ${index + 1}: Lat: ${punto.lat.toFixed(6)}, Lon: ${punto.lon.toFixed(6)}, Elevación: ${punto.elevacion.toFixed(2)} m\n`;
        });
        document.getElementById("elevaciones").innerText = resultados;
        document.getElementById('calculationsDiv').style.display = 'block';
    
        // Si el número de puntos generados es menor o igual al número de puntos de control,
        // se actualiza la poligonal normalmente:
        if (elevaciones.length <= puntos.length) {
            elevaciones.forEach((punto) => {
                agregarPuntoAGrid(punto.lat, punto.lon, punto.elevacion);
            });
        } else {
            // Para los puntos distribuidos (generados con el botón),
            // se añade el valor 'button' como origen.
            elevaciones.forEach((punto) => {
                puntos.push([punto.lat, punto.lon, punto.elevacion, 'button']);
            });
            actualizarTabla();
            // No se actualiza la poligonal para evitar distorsión.
            generarTablaDePendientes();
            generarArrayPendientes();
        }
    }

    function interpolarPendiente(lat, lon, puntos, minElev) {
        const tol = 1e-6;
        // Obtiene todos los valores únicos de latitud y longitud en orden ascendente
        const lats = Array.from(new Set(puntos.map(p => p[0]))).sort((a, b) => a - b);
        const lons = Array.from(new Set(puntos.map(p => p[1]))).sort((a, b) => a - b);
        
        // Buscar los vecinos en latitud: lat0 <= lat <= lat1
        let lat0 = lats[0], lat1 = lats[lats.length - 1];
        for (let i = 0; i < lats.length; i++) {
            if (lats[i] <= lat) lat0 = lats[i];
            if (lats[i] >= lat) { lat1 = lats[i]; break; }
        }
        // Buscar los vecinos en longitud: lon0 <= lon <= lon1
        let lon0 = lons[0], lon1 = lons[lons.length - 1];
        for (let j = 0; j < lons.length; j++) {
            if (lons[j] <= lon) lon0 = lons[j];
            if (lons[j] >= lon) { lon1 = lons[j]; break; }
        }
        
        // Función auxiliar para obtener la pendiente en (latVal, lonVal) si existe
        function getPendiente(latVal, lonVal) {
            const encontrado = puntos.find(p => Math.abs(p[0] - latVal) < tol && Math.abs(p[1] - lonVal) < tol);
            return (encontrado) ? ((encontrado[2] - minElev) / 100) : null;
        }
    
        const Q11 = getPendiente(lat0, lon0);
        const Q21 = getPendiente(lat0, lon1);
        const Q12 = getPendiente(lat1, lon0);
        const Q22 = getPendiente(lat1, lon1);
        
        // Si no se encontraron suficientes datos, se devuelve el promedio de los disponibles
        const disponibles = [Q11, Q21, Q12, Q22].filter(v => v !== null);
        if(disponibles.length === 0) return 0;
        if(disponibles.length < 4 || Math.abs(lat1 - lat0) < tol || Math.abs(lon1 - lon0) < tol) {
            return disponibles.reduce((a, b) => a + b, 0) / disponibles.length;
        }
        
        // Bilinear interpolation
        const fxy = (Q11 * (lat1 - lat) * (lon1 - lon) +
                     Q21 * (lat1 - lat) * (lon - lon0) +
                     Q12 * (lat - lat0) * (lon1 - lon) +
                     Q22 * (lat - lat0) * (lon - lon0)) / ((lat1 - lat0) * (lon1 - lon0));
        return fxy;
    }
    
    async function generarTablaDePendientes() {
        const todosLosPuntos = [...puntos];
        if (todosLosPuntos.length === 0) return;
        
        // Calcular la elevación mínima entre todos los puntos
        const minElev = Math.min(...todosLosPuntos.map(p => p[2]));
        
        // Obtener coordenadas únicas redondeadas (a 6 decimales)
        const uniqueLats = Array.from(new Set(todosLosPuntos.map(p => Number(p[0].toFixed(6))))).sort((a, b) => b - a);
        const uniqueLons = Array.from(new Set(todosLosPuntos.map(p => Number(p[1].toFixed(6))))).sort((a, b) => a - b);
        
        // Construir la cabecera con longitudes (orden ascendente)
        rangoPendientesHeader.innerHTML = '<th>Longitud\\Latitud</th>';
        uniqueLons.forEach(lon => {
            rangoPendientesHeader.innerHTML += `<th>${lon.toFixed(6)}</th>`;
        });
        
        // Construir el cuerpo de la tabla
        rangoPendientesTableBody.innerHTML = '';
        for (const lat of uniqueLats) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${lat.toFixed(6)}</td>`;
            
            for (const lon of uniqueLons) {
                const cell = document.createElement('td');
                // Buscar si existe un punto exacto (usando las coordenadas redondeadas)
                let punto = todosLosPuntos.find(p => 
                    Number(p[0].toFixed(6)) === lat && Number(p[1].toFixed(6)) === lon
                );
                let pendiente;
                if (punto) {
                    pendiente = (punto[2] - minElev) / 100;
                } else {
                    // Si no existe, interpolar
                    pendiente = interpolarPendiente(lat, lon, todosLosPuntos, minElev);
                    // Si el resultado es null o NaN, consultar la API Open Elevation
                    if (pendiente === null || isNaN(pendiente)) {
                        const elev = await obtenerElevacion(lat, lon);
                        pendiente = (elev - minElev) / 100;
                    }
                }
                cell.innerHTML = pendiente.toFixed(2);
                row.appendChild(cell);
            }
            rangoPendientesTableBody.appendChild(row);
        }
        
        document.getElementById('rangoPendientesDiv').style.display = 'block';
    }

    function generarArrayPendientes() {
        if (puntos.length === 0) {
            document.getElementById('pendientes').innerText = "No hay pendientes.";
            return;
        }
        
        // Calcular la elevación mínima entre todos los puntos
        const minElev = Math.min(...puntos.map(p => p[2]));
        
        // Generar el array de pendientes: cada elemento incluye latitud, longitud y pendiente (formateada a dos decimales)
        const pendientes = puntos.map(p => ({
            lat: p[0].toFixed(6),
            lon: p[1].toFixed(6),
            pendiente: ((p[2] - minElev) / 100).toFixed(2)
        }));
        
        // Mostrar el array en el div con id "pendientes"
        const pendientesDiv = document.getElementById('pendientes');
        pendientesDiv.style.display = 'block';
        
        let salida = "Pendientes:\n";
        pendientes.forEach(item => {
            salida += `Lat: ${item.lat}, Lon: ${item.lon}, Pendiente: ${item.pendiente}\n`;
        });
        pendientesDiv.innerText = salida;
    }

    function crearTablaPendientes() {
        const pendientesDiv = document.getElementById('pendientes');
        
        if (puntos.length === 0) {
            pendientesDiv.innerHTML = "No hay pendientes.";
            return;
        }
        
        // Calcular la elevación mínima entre todos los puntos
        const minElev = Math.min(...puntos.map(p => p[2]));
        
        // Generar el array de pendientes: cada objeto incluye lat, lon y pendiente (formateada a dos decimales)
        const pendientesArray = puntos.map(p => ({
            lat: p[0].toFixed(6),
            lon: p[1].toFixed(6),
            pendiente: ((p[2] - minElev) / 100).toFixed(2)
        }));
        
        // Construir la tabla HTML
        let html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse;">
<thead>
<tr>
    <th>Latitud</th>
    <th>Longitud</th>
    <th>Pendiente</th>
</tr>
</thead>
<tbody>`;
        
        pendientesArray.forEach(item => {
            html += `<tr>
<td>${item.lat}</td>
<td>${item.lon}</td>
<td>${item.pendiente}</td>
</tr>`;
        });
        
        html += `</tbody></table>`;
        
        // Mostrar la tabla en el div "pendientes"
        pendientesDiv.innerHTML = html;
    }

    function eliminarPunto(index) {
        puntos.splice(index, 1);
        actualizarTabla();
        actualizarPoligonal();
        generarTablaDePendientes(); // Regenerar la tabla de pendientes tras una eliminación
        generarArrayPendientes(); // Actualizar el array de pendientes tras una eliminación
    }

    document.getElementById('generatePointsWithHeights').addEventListener('click', generarPuntosEnCuadradoConAlturas);
    document.getElementById('searchBtn').addEventListener('click', async () => {
        const searchText = document.getElementById('search').value;
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}`;
        const response = await fetch(geocodeUrl);
        const results = await response.json();

        if (results.length > 0) {
            const lat = parseFloat(results[0].lat);
            const lon = parseFloat(results[0].lon);
            map.setView([lat, lon], 15);
            // Se quita la siguiente línea para evitar agregar un punto al buscar:
            // const elevacion = await obtenerElevacion(lat, lon);
            // agregarPuntoAGrid(lat, lon, elevacion);
        } else {
            alert('No se encontraron resultados.');
        }
    });

    document.getElementById('addPoint').addEventListener('click', async () => {
        const index = parseInt(prompt("Índice para insertar el punto:"));
        const latLng = await new Promise((resolve) => {
            map.once('click', (e) => {
                resolve([e.latlng.lat, e.latlng.lng]);
            });
        });

        const elevacion = await obtenerElevacion(latLng[0], latLng[1]);
        if (isNaN(index) || index < 0 || index >= puntos.length) {
            puntos.push([latLng[0], latLng[1], elevacion]);
        } else {
            puntos.splice(index, 0, [latLng[0], latLng[1], elevacion]);
        }
        actualizarTabla();
        actualizarPoligonal();
        generarTablaDePendientes(); // Regenerar la tabla de pendientes al agregar un punto
        generarArrayPendientes(); // Actualiza el array de pendientes
    });

    document.getElementById('editPoint').addEventListener('click', async () => {
        const index = parseInt(prompt("Índice del punto a editar:"));
        if (index < 0 || index >= puntos.length) {
            alert("Índice no válido.");
            return;
        }
        const lat = parseFloat(prompt("Nueva latitud:", puntos[index][0]));
        const lon = parseFloat(prompt("Nueva longitud:", puntos[index][1]));
        const elevacion = await obtenerElevacion(lat, lon);
        puntos[index] = [lat, lon, elevacion];
        actualizarTabla();
        actualizarPoligonal();
        generarTablaDePendientes(); // Regenerar tabla de pendientes al editar
        generarArrayPendientes(); // Actualiza el array de pendientes
    });

    document.getElementById('lineColor').addEventListener('input', actualizarPoligonal);
    document.getElementById('fillColor').addEventListener('input', actualizarPoligonal);
    document.getElementById('lineWidth').addEventListener('input', actualizarPoligonal);
    document.getElementById('pendientes').style.display = 'none';

    document.getElementById('toggleTables').addEventListener('click', () => {
        const tablesDiv = document.getElementById('tables');
        if (!tablesDiv.style.display || tablesDiv.style.display === 'none') {
            tablesDiv.style.display = 'block';
        } else {
            tablesDiv.style.display = 'none';
        }
    });

    document.getElementById('toggleArrays').addEventListener('click', () => {
        const arraysDiv = document.getElementById('arraysDiv');
        const currentDisplay = window.getComputedStyle(arraysDiv).display;
        if (currentDisplay === 'none') {
            arraysDiv.style.display = 'flex';
        } else {
            arraysDiv.style.display = 'none';
        }
    });
});

function mostrarArrayPuntos() {
    const puntosDiv = document.getElementById('puntos');
    if (puntos.length === 0) {
        puntosDiv.innerText = "No hay puntos registrados.";
    } else {
        // Se muestra como JSON para depuración; puedes formatearlo como necesites
        puntosDiv.innerText = "Puntos:\n" + JSON.stringify(puntos, null, 2);
    }
}

document.getElementById('calculos').addEventListener('click', () => {
    const calcDiv = document.getElementById('calculationsDiv');
    if(calcDiv.style.display === 'none' || calcDiv.style.display === ''){
        calcDiv.style.display = 'flex';
        document.getElementById('calculos').innerText = 'Ocultar Resultados';
    } else {
        calcDiv.style.display = 'none';
        document.getElementById('calculos').innerText = 'Mostrar Resultados';
    }
});

function plotContourGraphs(elevacionesArray, pendientesArray, bounds) {
    const [minLat, maxLat, minLon, maxLon] = bounds;

    // Preparar arrays de latitudes y longitudes para elevaciones y pendientes
    const latsElev = Array.from(new Set(elevacionesArray.map(p => p.lat))).sort((a, b) => a - b);
    const lonsElev = Array.from(new Set(elevacionesArray.map(p => p.lon))).sort((a, b) => a - b);

    let elevMatrix = [];
    latsElev.forEach(lat => {
        let row = [];
        lonsElev.forEach(lon => {
            const point = elevacionesArray.find(p => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
            row.push(point ? point.elevacion : null);
        });
        elevMatrix.push(row);
    });

    const latsPend = Array.from(new Set(pendientesArray.map(p => p.lat))).sort((a, b) => a - b);
    const lonsPend = Array.from(new Set(pendientesArray.map(p => p.lon))).sort((a, b) => a - b);

    let pendMatrix = [];
    latsPend.forEach(lat => {
        let row = [];
        lonsPend.forEach(lon => {
            const point = pendientesArray.find(p => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
            row.push(point ? point.pendiente : null);
        });
        pendMatrix.push(row);
    });

    // Asegúrate de que backgroundImageUrl tenga la URL o ruta local de tu imagen del área del mapa
    const backgroundImageUrl = "https://via.placeholder.com/600x400.png?text=Area+del+Mapa";
    
    // Configuración de la gráfica de elevaciones
    var elevData = [{
        x: lonsElev,
        y: latsElev,
        z: elevMatrix,
        type: 'contour',
        colorscale: 'Viridis',
        showscale: false,
        name: 'Elevaciones'
    }];

    var elevLayout = {
        xaxis: { 
            title: 'Longitud', 
            range: [minLon, maxLon],
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        yaxis: { 
            title: 'Latitud', 
            range: [minLat, maxLat],
            scaleanchor: 'x',
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        margin: { l: 20, r: 20, t: 20, b: 20 },
        images: [{
            source: backgroundImageUrl,  // URL o ruta de la imagen del mapa de Leaflet
            xref: 'x',
            yref: 'y',
            x: minLon,
            y: maxLat,
            sizex: maxLon - minLon,
            sizey: maxLat - minLat,
            opacity: 0.5,    // Ajusta la opacidad según necesites
            layer: 'below'
        }]
    };

    // Configuración de la gráfica de pendientes
    var pendData = [{
        x: lonsPend,
        y: latsPend,
        z: pendMatrix,
        type: 'contour',
        colorscale: 'Jet',
        showscale: false,
        name: 'Pendientes'
    }];

    var pendLayout = {
        xaxis: { 
            title: 'Longitud', 
            range: [minLon, maxLon],
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        yaxis: { 
            title: 'Latitud', 
            range: [minLat, maxLat],
            scaleanchor: 'x',
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        margin: { l: 20, r: 20, t: 20, b: 20 },
        images: [{
            source: backgroundImageUrl,
            xref: 'x',
            yref: 'y',
            x: minLon,
            y: maxLat,
            sizex: maxLon - minLon,
            sizey: maxLat - minLat,
            opacity: 0.5,
            layer: 'below'
        }]
    };

    Plotly.newPlot('elevacionesGraph', elevData, elevLayout);
    Plotly.newPlot('pendientesGraph', pendData, pendLayout);
}

function plotContourGraphsElevacionesAndPendientes(elevacionesArray, pendientesArray, bounds, backgroundImageUrl) {
    // Extraer límites: [minLat, maxLat, minLon, maxLon]
    const [minLat, maxLat, minLon, maxLon] = bounds;
    
    // Crear arrays de latitudes y longitudes a partir del array de elevaciones (asumido en grilla uniforme)
    const latsElev = Array.from(new Set(elevacionesArray.map(p => p.lat))).sort((a, b) => a - b);
    const lonsElev = Array.from(new Set(elevacionesArray.map(p => p.lon))).sort((a, b) => a - b);
    
    // Construir matriz de elevaciones
    let elevMatrix = [];
    latsElev.forEach(lat => {
        let row = [];
        lonsElev.forEach(lon => {
            const point = elevacionesArray.find(p => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
            row.push(point ? point.elevacion : null);
        });
        elevMatrix.push(row);
    });
    
    // Crear arrays de latitudes y longitudes a partir del array de pendientes
    const latsPend = Array.from(new Set(pendientesArray.map(p => p.lat))).sort((a, b) => a - b);
    const lonsPend = Array.from(new Set(pendientesArray.map(p => p.lon))).sort((a, b) => a - b);
    
    // Construir matriz de pendientes
    let pendMatrix = [];
    latsPend.forEach(lat => {
        let row = [];
        lonsPend.forEach(lon => {
            const point = pendientesArray.find(p => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
            row.push(point ? point.pendiente : null);
        });
        pendMatrix.push(row);
    });
    
    // Configuración de la gráfica de elevaciones
    var elevData = [{
        x: lonsElev,
        y: latsElev,
        z: elevMatrix,
        type: 'contour',
        colorscale: 'Viridis',
        showscale: false,
        name: 'Elevaciones'
    }];
    
    var elevLayout = {
        xaxis: { 
            title: 'Longitud', 
            range: [minLon, maxLon],
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        yaxis: { 
            title: 'Latitud', 
            range: [minLat, maxLat],
            scaleanchor: 'x',
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        margin: { l: 20, r: 20, t: 20, b: 20 },
        // Incorporar la imagen de fondo que representa el área del mapa
        images: [{
            source: backgroundImageUrl,
            xref: 'x',
            yref: 'y',
            x: minLon,
            y: maxLat,
            sizex: maxLon - minLon,
            sizey: maxLat - minLat,
            opacity: 0.5,
            layer: 'below'
        }]
    };
    
    // Configuración de la gráfica de pendientes
    var pendData = [{
        x: lonsPend,
        y: latsPend,
        z: pendMatrix,
        type: 'contour',
        colorscale: 'Jet',
        showscale: false,
        name: 'Pendientes'
    }];
    
    var pendLayout = {
        xaxis: { 
            title: 'Longitud', 
            range: [minLon, maxLon],
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        yaxis: { 
            title: 'Latitud', 
            range: [minLat, maxLat],
            scaleanchor: 'x',
            tickfont: { color: '#ffffff', size: 14 },
            titlefont: { color: '#ffffff', size: 16 }
        },
        margin: { l: 20, r: 20, t: 20, b: 20 },
        images: [{
            source: backgroundImageUrl,
            xref: 'x',
            yref: 'y',
            x: minLon,
            y: maxLat,
            sizex: maxLon - minLon,
            sizey: maxLat - minLat,
            opacity: 0.5,
            layer: 'below'
        }]
    };
    
    Plotly.newPlot('elevacionesGraph', elevData, elevLayout);
    Plotly.newPlot('pendientesGraph', pendData, pendLayout);
}