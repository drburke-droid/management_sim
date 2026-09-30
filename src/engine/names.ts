import type { Rng } from './rng';

const FIRST_US = `Aaron Adam Alan Alex Andrew Andy Austin Barry Ben Blake Brad Brady Brandon Brent Brett Brian Bryce Caleb
Calvin Cam Carl Carson Casey Chad Charlie Chase Chris Clay Cody Cole Colin Connor Corey Craig Curtis Dale Dalton Dan
Danny Darren Dave Derek Devin Dexter Dillon Doug Drew Dustin Dylan Eddie Eli Eric Ethan Evan Garrett Gary Gavin Glen
Grady Grant Greg Hank Harold Hayden Heath Hunter Ian Isaac Jack Jace Jacob Jake Jared Jason Jay Jeff Jeremy Jesse Jim
Joel Joey Josh Justin Kade Keith Kellen Ken Kevin Kirk Kyle Lance Landon Larry Levi Logan Lonnie Luke Mack Marcus Mark
Mason Matt Max Micah Mike Mitch Nate Neil Nick Noah Nolan Owen Parker Pat Paul Pete Phil Quinn Randy Ray Reed Rex Rick
Riley Rob Rod Roger Ross Russ Ryan Sam Scott Seth Shane Shawn Spencer Steve Stu Ted Terry Tim Toby Todd Tom Tony Travis
Trent Trevor Troy Tucker Ty Tyler Vince Wade Walt Wes Will Wyatt Zach Zane Deshawn Terrell Darius Jalen Andre Marquis
Tre Lamar Cedric Reggie Otis Darnell Jerome Malik Isaiah Xavier Cornell Dwayne Emmett Hollis Jett Knox Rhett Beau Brooks
Colt Dax Reid Gage Tate Sawyer Porter Weston Holt Crosby Boone Rowan Easton Jensen Lane`
  .split(/\s+/);

const FIRST_LAT = `Alejandro Alexis Andres Angel Anibal Armando Carlos Cesar Cristian Daniel Dario Diego Eduardo Edwin Elvis
Emilio Enrique Ernesto Esteban Eugenio Felix Fernando Francisco Freddy Gabriel Geraldo Gilberto Gregorio Hector Hernan
Hugo Ignacio Ismael Ivan Javier Jesus Joaquin Jorge Jose Juan Julio Leonel Luis Manuel Marcelo Mario Martin Miguel
Moises Nelson Nestor Octavio Omar Orlando Oscar Pablo Pedro Rafael Ramon Raul Reinaldo Renato Ricardo Roberto Rodrigo
Ronny Ruben Salvador Santiago Sergio Teoscar Tomas Ulises Victor Wilmer Wilson Yadiel Yandel Yeison Yoan Yordan Yunior
Elian Deivi Wander Jeimer Starlin Framber Cristopher Ezequiel Johan Robinson Anderson Endy Lisandro`
  .split(/\s+/);

const FIRST_ASIA = `Hiro Kenta Daisuke Takumi Ryo Shota Yuki Kazu Haruto Sho Koji Masato Seung Min-jun Jae Hyun Dong Tae
Wei Chen Kai`.split(/\s+/);

const LAST_US = `Abbott Adair Aldridge Allen Ames Archer Arnold Ashby Atwood Bailey Baird Baker Banks Barlow Barnes Barrett
Bartlett Baxter Beale Beck Bell Benson Bishop Blackwell Blair Bolton Booker Bowen Boyd Bradford Bragg Brennan Brewer
Bridges Briggs Brock Brooks Buckley Bullock Burch Burgess Burke Burns Burton Bush Byrd Cain Caldwell Calhoun Camp
Cannon Carlisle Carr Carver Chambers Chandler Chapman Clark Clayton Cobb Cochran Coleman Collier Conner Conway Cooke
Corbin Cowan Crane Crawford Crockett Cross Cullen Dalton Daniels Davenport Dawson Decker Delaney Dillard Dixon Dodd
Donovan Dorsey Doyle Drake Dudley Duffy Duncan Dunn Durham Eaton Ellis Emerson Ewing Farley Farmer Farrell Fenton
Finch Fisher Fleming Fletcher Flynn Foley Forbes Fowler Frost Fuller Gaines Galloway Gardner Garrett Gentry Gibbs
Gilbert Glover Goodwin Gordon Graves Greer Griffin Hale Hall Hammond Hancock Hardin Harmon Harper Hartley Hawkins Hayes
Healy Hendrix Hensley Hicks Hodges Holland Holt Hooper Horton Houston Howell Hubbard Hudson Hughes Hull Ingram Irwin
Jarvis Jennings Jensen Kane Keller Kemp Kendall Kerr Kidd Kimball Kirby Knapp Knowles Lamb Lambert Landry Lane Lawson
Leach Logan Lowry Lucas Lyons Mack Maddox Malone Mann Marsh Maxwell Mayfield McBride McCall McCoy McKay McKenzie
Mercer Merritt Middleton Monroe Moody Morrow Morton Moss Murphy Nash Newman Nichols Nixon Norris Novak Oakley Odom
Oliver Osborne Owens Pace Palmer Parrish Patton Paxton Payne Pearce Pennington Perkins Pickett Pierce Pike Poole
Porter Potter Pratt Preston Price Pruitt Quinn Ramsey Randall Rankin Reese Rhodes Riggs Ritter Roach Rollins Rowe
Russell Sampson Sanders Savage Sawyer Schaefer Schultz Sears Sellers Sexton Shaffer Shelton Shepherd Sheridan Short
Simmons Slater Sloan Snyder Spears Stafford Stanton Stark Stokes Stone Strickland Sullivan Sutton Swanson Tanner Tate
Thornton Tillman Todd Townsend Tucker Turner Tyler Underwood Vance Vaughn Wagner Walker Wallace Walsh Walton Ward
Warner Watkins Weaver Webb Welch Wheeler Whitaker Whitley Wilcox Wilder Wiley Winters Wolfe Womack Wooten Wright Yates
York Young Zimmer Kowalski Lindgren Petersen Brandt Hoffman Kessler Ostrowski Mueller Dempsey Gallagher O'Brien
O'Neill McGuire Fitzgerald Kilgore Lockhart Redmond Whitfield Ashford Carmichael Fairbanks Holloway Langston Pembrook`
  .split(/\s+/);

const LAST_LAT = `Acosta Aguilar Alvarado Alvarez Arias Avila Batista Bautista Beltran Benitez Cabrera Calderon Camacho
Castillo Castro Cedeno Cervantes Colon Contreras Cordero Cruz Delgado Diaz Dominguez Duran Espinal Espinoza Estrada
Fermin Figueroa Flores Franco Fuentes Galvez Garcia Gomez Guerrero Gutierrez Guzman Herrera Hidalgo Ibarra Jimenez
Lara Leon Lopez Lugo Luna Machado Maldonado Marte Martinez Medina Mejia Mendoza Mercedes Molina Montero Morales
Moreno Navarro Nunez Ochoa Olivo Ortega Ortiz Pacheco Padilla Paredes Pena Peralta Perez Pineda Polanco Quintana
Ramirez Ramos Reyes Rios Rivas Rivera Robles Rodriguez Rojas Romero Rosario Ruiz Salazar Sanchez Santana Santos
Sierra Soto Suarez Tavarez Tejada Torres Valdez Valencia Vargas Vasquez Vega Velazquez Villanueva Zambrano Zapata
Abreu Almonte Baez Encarnacion Familia Frias Hernandez Liriano Mateo Minaya Pimentel Severino Taveras Ureña`
  .split(/\s+/);

const LAST_ASIA = `Tanaka Suzuki Watanabe Kobayashi Nakamura Yamamoto Sato Ito Kato Matsuda Kim Park Lee Choi Kang Oh
Chen Lin Wang Huang`.split(/\s+/);

/** Generate a unique fake name. Background loosely follows the template's origin. */
export function makeName(rng: Rng, intl: boolean, used: Set<string>): string {
  for (let tries = 0; tries < 200; tries++) {
    let first: string, last: string;
    const r = rng.next();
    if (intl) {
      if (r < 0.9) {
        first = rng.pick(FIRST_LAT);
        last = rng.pick(LAST_LAT);
      } else {
        first = rng.pick(FIRST_ASIA);
        last = rng.pick(LAST_ASIA);
      }
    } else if (r < 0.12) {
      first = rng.pick(FIRST_LAT);
      last = rng.pick(LAST_LAT);
    } else {
      first = rng.pick(FIRST_US);
      last = rng.pick(LAST_US);
    }
    let name = `${first} ${last}`;
    if (tries > 150) name += ' Jr.';
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const n = `Player ${used.size}`;
  used.add(n);
  return n;
}
