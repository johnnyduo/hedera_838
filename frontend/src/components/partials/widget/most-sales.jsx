import React from "react";
import world from "@svg-maps/world";
import { CheckboxSVGMap } from "react-svg-map";

const slaes = [
  {
    title: "Saudi Arabia",
    amount: "+ >4°C",
    cls: "bg-primary-500 ring-primary-500",
  },
  {
    title: "India",
    amount: "+ >4°C",
    cls: "bg-success-500 ring-success-500",
  },
  {
    title: "Russia",
    amount: "+4°C",
    cls: "bg-info-500 ring-info-500",
  },
  {
    title: "China",
    amount: "+3°C",
    cls: "bg-warning-500 ring-warning-500",
  },
  {
    title: "United States",
    amount: "+2°C",
    cls: "bg-success-500 ring-success-500",
  },
  {
    title: "United Kingdom",
    amount: "+1.5°C",
    cls: "bg-secondary-500 ring-secondary-500",
  },
];

const MostSales = ({ filterMap }) => {
  return (
    <div className="md:flex items-center">
      <div className="flex-none">
        <h4 className="text-slate-600 dark:text-slate-200 text-sm font-normal mb-[6px]">
          Carbon Removal Goal
        </h4>
        {filterMap === "usa" && (
          <div className="text-lg font-medium mb-[6px] dark:text-white text-slate-900">
            52.4B Ton
          </div>
        )}
        {filterMap === "global" && (
          <div className="text-lg font-medium mb-[6px] dark:text-white text-slate-900">
            52.4B Ton
          </div>
        )}
        <div className="text-xs font-light dark:text-slate-200">
          <span className="text-primary-500">+0.45&deg;C</span> From last month
        </div>
        <ul className="bg-slate-50 dark:bg-slate-900 rounded p-4 min-w-[184px] space-y-5 mt-4">
          {slaes.map((item, i) => (
            <li
              key={i}
              className="flex justify-between text-xs text-slate-600 dark:text-slate-300"
            >
              <span className="flex space-x-2 rtl:space-x-reverse items-center">
                <span
                  className={` inline-flex h-[6px] w-[6px] bg-primary-500 ring-opacity-25 rounded-full ring-4
                        ${item.cls}
                        `}
                ></span>
                <span>{item.title}</span>
              </span>
              <span>{item.amount}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1">
        <CheckboxSVGMap
          map={world}
          className="h-[350px] w-full dash-codevmap"
        />
      </div>
    </div>
  );
};

export default MostSales;
