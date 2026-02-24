const menu=document.getElementById("menu");
const overlay=document.getElementById("overlay");

function toggleMenu(){

menu.classList.toggle("show");
overlay.classList.toggle("show");

}

overlay.onclick=function(){

menu.classList.remove("show");
overlay.classList.remove("show");

}



