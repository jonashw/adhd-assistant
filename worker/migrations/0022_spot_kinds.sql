-- A spot can match a kind of place on OpenStreetMap ("brand=Costco", "amenity=library"), so the app can suggest
-- "Looks like you're at Costco" from the phone's location. A spot pinned to one place (Home) keeps its pin on Jon's
-- phone, not here: the server never learns where he is or lives.
ALTER TABLE spots ADD COLUMN osm TEXT;

UPDATE spots SET osm = 'amenity=library' WHERE id = 'library';
UPDATE spots SET osm = 'leisure=park' WHERE id = 'park';
UPDATE spots SET osm = 'amenity=school' WHERE id = 'school';
UPDATE spots SET osm = 'shop=supermarket' WHERE id = 'supermarket';
UPDATE spots SET osm = 'brand=Costco' WHERE id = 'costco';
UPDATE spots SET osm = 'brand=The Home Depot' WHERE id = 'home-depot';
