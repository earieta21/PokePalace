import React, { useState } from "react";
import Menu from "../components/Menu";
import styles from "./MenuPage.module.css";
import salmon from "../assets/salmon.webp";
import veggie from "../assets/veggie.webp";

const MenuPage = () => {
  // Example menu data (can be replaced with API data later)
  const allMenuItems = [
    {
      id: 1,
      name: "Salmon Poke",
      price: "$12.99",
      category: "Classic",
      img: { salmon },
    },
    {
      id: 2,
      name: "Tuna Poke",
      price: "$13.99",
      category: "Classic",
      img: "/assets/tuna.jpg",
    },
    {
      id: 3,
      name: "Veggie Bowl",
      price: "$10.99",
      category: "Vegetarian",
      img: { veggie },
    },
    {
      id: 4,
      name: "Spicy Shrimp",
      price: "$14.99",
      category: "Special",
      img: "/assets/shrimp.jpg",
    },
    {
      id: 5,
      name: "Chicken Teriyaki",
      price: "$11.99",
      category: "Classic",
      img: "/assets/chicken.jpg",
    },
  ];

  // State to track filtered items and selected category
  const [filteredItems, setFilteredItems] = useState(allMenuItems);
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Function to handle category filtering
  const handleFilter = (category) => {
    setSelectedCategory(category);
    if (category === "All") {
      setFilteredItems(allMenuItems);
    } else {
      setFilteredItems(
        allMenuItems.filter((item) => item.category === category)
      );
    }
  };

  return (
    <div className={styles.menuPage}>
      <h1 className={styles.title}>Our Menu</h1>
      <p className={styles.description}>
        Explore our delicious poke bowls, made fresh with the finest
        ingredients.
      </p>

      {/* Filter Buttons */}
      <div className={styles.filterButtons}>
        {["All", "Classic", "Vegetarian", "Special"].map((category) => (
          <button
            key={category}
            className={`${styles.filterButton} ${
              selectedCategory === category ? styles.active : ""
            }`}
            onClick={() => handleFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Menu Items */}
      <Menu items={filteredItems} />
    </div>
  );
};

export default MenuPage;
