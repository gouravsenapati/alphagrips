export async function loadModule(name) {

  const container = document.getElementById("moduleContent");

  const module = await import(`/js/modules/${name}/${name}.js`);

  container.innerHTML = "Loading...";

  module.init();
}